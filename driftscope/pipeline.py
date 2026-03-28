"""
DriftPipeline — high-level pipeline for before/after drift measurement.

Typical usage::

    from driftscope import DriftPipeline

    pipeline = DriftPipeline(project="my-agent")

    @pipeline.baseline
    def v1_agent(query: str) -> str:
        result = search(query)
        pipeline.record_tool_call("search", {"q": query}, result)
        return f"Answer: {result}"

    @pipeline.current
    def v2_agent(query: str) -> str:
        result = search(query)
        pipeline.record_tool_call("search", {"q": query}, result)
        extra = validate(result)
        pipeline.record_tool_call("validate", {}, extra)
        return f"Answer: {result}"

    pipeline.run(
        queries=QUERIES,
        scenario="Added validation step after policy update",
        kb_update=["+ Validate eligibility before responding"],
    )
"""

from __future__ import annotations

import json
import os
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Callable, Sequence
from urllib import error, request

from .capture import DriftScope
from .detector import DriftAnalyzer, DriftThresholds, compare_paths, compute_tool_usage_drift

# ── Terminal helpers ──────────────────────────────────────────────────────────

_GRN = "\033[32m"
_ORG = "\033[33m"
_RED = "\033[31m"
_DIM = "\033[2m"
_BLD = "\033[1m"
_RST = "\033[0m"


def _p(msg: str = "", end: str = "\n") -> None:
    print(msg, end=end, flush=True)


def _bar(steps: int, max_steps: int = 6) -> str:
    return "█" * steps + _DIM + "░" * max(0, max_steps - steps) + _RST


# ── DriftPipeline ─────────────────────────────────────────────────────────────


class DriftPipeline:
    """
    Orchestrates a baseline → current drift measurement pipeline.

    The pipeline owns two DriftScope instances (one per phase) and exposes
    ``@pipeline.baseline`` / ``@pipeline.current`` decorators to register
    agent functions, plus ``pipeline.record_tool_call()`` to record individual
    tool invocations (replaces calling ds.record_tool_call directly).
    """

    def __init__(
        self,
        project: str,
        *,
        baseline_db:  str | Path | None = None,
        current_db:   str | Path | None = None,
        output_dir:   str | Path | None = None,
        frontend_dir: str | Path | None = None,
        min_samples:  int = 5,
        min_baseline: int = 20,
    ) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        demo_out  = repo_root / "demo" / "output"
        slug      = project.replace("-", "_")

        self.project      = project
        self.output_dir   = Path(output_dir)   if output_dir   else demo_out
        self.frontend_dir = Path(frontend_dir) if frontend_dir else (
            repo_root / "dashboard" / "web" / "public" / "data"
        )
        self._thresholds  = DriftThresholds(
            min_sample_size  = min_samples,
            min_baseline_size= min_baseline,
        )
        self._ds_b = DriftScope(
            project  = project,
            db_path  = str(baseline_db) if baseline_db else str(demo_out / f"{slug}_baseline.db"),
            async_writes = False,
        )
        self._ds_c = DriftScope(
            project  = project,
            db_path  = str(current_db)  if current_db  else str(demo_out / f"{slug}_current.db"),
            async_writes = False,
        )

        self._active_ds:   DriftScope | None = None
        self._step_counter: int = 0
        self._baseline_fn: Callable | None = None
        self._current_fn:  Callable | None = None

    # ── Public decorators ─────────────────────────────────────────────────────

    def baseline(self, fn: Callable) -> Callable:
        """Decorator: registers *fn* as the baseline agent and wraps it with tracing."""
        wrapped = self._ds_b.trace(fn)
        self._baseline_fn = wrapped
        return wrapped

    def current(self, fn: Callable) -> Callable:
        """Decorator: registers *fn* as the current agent and wraps it with tracing."""
        wrapped = self._ds_c.trace(fn)
        self._current_fn = wrapped
        return wrapped

    def record_tool_call(
        self,
        tool_name: str,
        tool_args: dict[str, Any] | None,
        tool_result: Any,
    ) -> None:
        """
        Record one tool call to the active phase's DriftScope and increment
        the internal step counter (used for the progress bar display).
        """
        self._step_counter += 1
        if self._active_ds is not None:
            self._active_ds.record_tool_call(tool_name, tool_args, tool_result)

    # ── Run ───────────────────────────────────────────────────────────────────

    def run(
        self,
        queries: Sequence[Any],
        *,
        scenario:      str = "",
        phase1_label:  str = "Phase 1 — Baseline",
        phase2_label:  str = "Phase 2 — Current",
        kb_update:     list[str] | None = None,
        event_label:   str | None = None,
        dashboard_url: str | None = None,
    ) -> dict[str, Any]:
        """
        Execute the full pipeline: baseline phase → event notice → current phase
        → drift analysis → export to dashboard.

        Returns the raw analysis dict.
        """
        if self._baseline_fn is None or self._current_fn is None:
            raise RuntimeError(
                "Register agents first with @pipeline.baseline and @pipeline.current"
            )

        self.output_dir.mkdir(parents=True, exist_ok=True)
        total_queries = len(queries) * 2
        observer_events: list[dict[str, Any]] = [
            _observer_event(
                "boot",
                "Observer attached to live refund agent",
                f"DriftScope started monitoring {len(queries)} refund requests for {self.project}.",
                status="info",
            )
        ]

        # Wipe old DBs for a clean run
        self._ds_b.store.reset()
        self._ds_c.store.reset()
        self._write_live_snapshot(
            status="collecting_baseline",
            baseline_records=[],
            current_records=[],
            phase_label=phase1_label,
            progress_completed=0,
            progress_total=total_queries,
            scenario=scenario,
            observer_events=observer_events,
        )

        _p()
        _p(f"{_BLD}{'═' * 60}{_RST}")
        _p(f"{_BLD}  DriftScope — {self.project}{_RST}")
        _p(f"{_BLD}{'═' * 60}{_RST}")
        _p(f"  Project  : {_ORG}{self.project}{_RST}")
        _p(f"  Queries  : {len(queries)}")
        if scenario:
            _p(f"  Scenario : {scenario}")
        _p()

        # Phase 1
        observer_events.append(
            _observer_event(
                "baseline_start",
                "Baseline capture started",
                "Observer is collecting healthy tool-call trajectories for the refund agent.",
                status="info",
            )
        )
        self._run_phase(
            self._baseline_fn,
            self._ds_b,
            queries,
            phase1_label,
            _GRN,
            snapshot_status="collecting_baseline",
            progress_offset=0,
            progress_total=total_queries,
            scenario=scenario,
            observer_events=observer_events,
        )
        self._ds_b.flush()
        observer_events.append(
            _observer_event(
                "baseline_done",
                "Baseline capture completed",
                f"{len(queries)} healthy traces are ready for comparison.",
                status="success",
            )
        )
        baseline_records = list(reversed(self._ds_b.store.list_recent(limit=1000)))
        self._write_live_snapshot(
            status="collecting_current",
            baseline_records=baseline_records,
            current_records=[],
            phase_label=phase2_label,
            progress_completed=len(queries),
            progress_total=total_queries,
            scenario=scenario,
            observer_events=observer_events,
        )

        # KB / prompt update notice
        if kb_update:
            observer_events.append(
                _observer_event(
                    "policy_update",
                    event_label or "Policy updated",
                    "Operations changed the refund policy bundle without a deployment.",
                    status="warning",
                )
            )
            _p()
            _p(f"  {_DIM}{'─' * 56}{_RST}")
            _p(f"  {_ORG}{_BLD}📋 Update applied:{_RST}")
            for line in kb_update:
                _p(f"  {_DIM}   {line}{_RST}")
            _p(f"  {_DIM}   (no code change · no deployment · no alert){_RST}")
            _p(f"  {_DIM}{'─' * 56}{_RST}")
            time.sleep(0.6)

        # Phase 2
        observer_events.append(
            _observer_event(
                "current_start",
                "Current capture started",
                "Observer is comparing live refund behavior against the healthy baseline.",
                status="info",
            )
        )
        self._run_phase(
            self._current_fn,
            self._ds_c,
            queries,
            phase2_label,
            _ORG,
            snapshot_status="collecting_current",
            progress_offset=len(queries),
            progress_total=total_queries,
            scenario=scenario,
            observer_events=observer_events,
        )
        self._ds_c.flush()

        # Re-open SQLite connections after async writes complete so analysis reads
        # are not using a stale handle from the capture phase.
        self._ds_b.store.reconnect()
        self._ds_c.store.reconnect()

        # Analysis
        _p()
        _p(f"  {_DIM}Analysing trajectories…{_RST}", end=" ")

        observer_events.append(
            _observer_event(
                "analysis_start",
                "Observer analysing trajectory drift",
                "Running MMD and path-level comparison on the live refund workflow.",
                status="info",
            )
        )

        baseline_records = list(reversed(self._ds_b.store.list_recent(limit=1000)))
        current_records  = list(reversed(self._ds_c.store.list_recent(limit=1000)))
        self._write_live_snapshot(
            status="analysing",
            baseline_records=baseline_records,
            current_records=current_records,
            phase_label="Observer analysis",
            progress_completed=total_queries,
            progress_total=total_queries,
            scenario=scenario,
            observer_events=observer_events,
        )

        analyzer = DriftAnalyzer(thresholds=self._thresholds)
        analysis = analyzer.analyze(
            baseline_trajectories=baseline_records,
            current_trajectories=current_records,
        )
        analysis["project"]      = self.project
        analysis["generated_at"] = time.time()
        analysis["history"]      = _build_live_run_timeline(
            baseline_records=baseline_records,
            current_records=current_records,
            event_label=event_label if kb_update else None,
            final_trajectory=float(analysis.get("trajectory_drift", 0.0)),
            final_output=float(analysis.get("output_drift", 0.0)),
        )
        runtime_controls = _build_runtime_controls(
            drift_type=analysis.get("drift_type", "normal"),
            should_alert=bool(analysis.get("should_alert")),
            behavior_drift_ratio=float(analysis.get("behavior_drift_ratio", 0.0)),
        )
        analysis.update(runtime_controls)
        analysis["sample_queries"] = [
            {
                "query":           b["query"],
                "baseline_path":   [s["tool"] for s in b["steps"]],
                "current_path":    [s["tool"] for s in c["steps"]],
                "baseline_output": b["output"],
                "current_output":  c["output"],
            }
            for b, c in zip(baseline_records[:8], current_records[:8])
        ]
        observer_events.extend(
            _build_final_observer_events(
                drift_type=analysis.get("drift_type", "normal"),
                runtime_action=runtime_controls["runtime_action"],
                recommended_next_step=runtime_controls["recommended_next_step"],
                should_alert=bool(analysis.get("should_alert")),
            )
        )
        analysis["observer_events"] = observer_events
        analysis["progress_completed"] = total_queries
        analysis["progress_total"] = total_queries
        analysis["live_status_label"] = (
            "Hidden drift detected"
            if analysis.get("drift_type") == "hidden"
            else "Live run completed"
        )

        email_event = _maybe_send_owner_alert(
            analysis=analysis,
            project=self.project,
            dashboard_url=dashboard_url or f"http://localhost:3000/dashboard?project={self.project}",
        )
        if email_event is not None:
            observer_events.append(email_event)
            analysis["observer_events"] = observer_events

        self._ds_b.store.save_analysis(analysis)
        self._ds_c.store.save_analysis(analysis)
        self._export(analysis, baseline_records, current_records)
        self._ds_b.store.close()
        self._ds_c.store.close()

        url = dashboard_url or (
            f"http://localhost:3000/dashboard?project={self.project}"
        )
        _print_summary(analysis, url)
        return analysis

    # ── Internal ──────────────────────────────────────────────────────────────

    def _run_phase(
        self,
        agent_fn: Callable,
        ds: DriftScope,
        queries: Sequence[Any],
        label: str,
        color: str,
        *,
        snapshot_status: str,
        progress_offset: int,
        progress_total: int,
        scenario: str,
        observer_events: list[dict[str, Any]],
    ) -> None:
        _p(f"\n{_BLD}{color}── {label}{_RST}")
        self._active_ds = ds
        for i, q in enumerate(queries, 1):
            self._step_counter = 0
            query = str(q)
            agent_fn(query)
            steps  = self._step_counter
            bar    = _bar(steps)
            status = f"{_GRN}✓{_RST}" if steps <= 3 else f"{_ORG}!{_RST}"
            short  = query
            if len(short) > 62:
                short = short[:62] + "…"
            _p(f"  {_DIM}{i:02d}{_RST} {status} {bar} ({steps} steps)  {_DIM}{short}{_RST}")
            observer_events.append(
                _observer_event(
                    f"{snapshot_status}_{i}",
                    "Baseline trace stored" if snapshot_status == "collecting_baseline" else "Live trace compared",
                    f"{short} · {steps} tool steps captured.",
                    status="info" if snapshot_status == "collecting_baseline" else "action",
                )
            )
            baseline_records = list(reversed(self._ds_b.store.list_recent(limit=1000)))
            current_records = list(reversed(self._ds_c.store.list_recent(limit=1000)))
            self._write_live_snapshot(
                status=snapshot_status,
                baseline_records=baseline_records,
                current_records=current_records,
                phase_label=label,
                progress_completed=progress_offset + i,
                progress_total=progress_total,
                scenario=scenario,
                observer_events=observer_events,
            )
            time.sleep(0.015)
        self._active_ds = None

    def _write_live_snapshot(
        self,
        *,
        status: str,
        baseline_records: list[dict[str, Any]],
        current_records: list[dict[str, Any]],
        phase_label: str,
        progress_completed: int,
        progress_total: int,
        scenario: str,
        observer_events: list[dict[str, Any]],
    ) -> None:
        analysis = _build_live_snapshot(
            project=self.project,
            status=status,
            phase_label=phase_label,
            progress_completed=progress_completed,
            progress_total=progress_total,
            scenario=scenario,
            baseline_records=baseline_records,
            current_records=current_records,
            observer_events=observer_events,
        )
        self._export(analysis, baseline_records, current_records)

    def _export(
        self,
        analysis: dict[str, Any],
        baseline_records: list[dict],
        current_records:  list[dict],
    ) -> None:
        slug   = self.project.replace("-", "_")
        bundle = {
            "project":  self.project,
            "analysis": analysis,
            "baseline": baseline_records,
            "current":  current_records,
        }

        def write(dest: Path, obj: object) -> None:
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(f"{dest.suffix}.tmp")
            tmp.write_text(
                json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            tmp.replace(dest)

        write(self.output_dir / f"{slug}_bundle.json", bundle)
        write(self.frontend_dir / self.project / "analysis.json",     analysis)
        write(self.frontend_dir / self.project / "trajectories.json", {
            "baseline": baseline_records,
            "current":  current_records,
        })


# ── Module-level helpers ──────────────────────────────────────────────────────


def _build_live_run_timeline(
    *,
    baseline_records: Sequence[dict[str, Any]],
    current_records: Sequence[dict[str, Any]],
    event_label: str | None = None,
    final_trajectory: float | None = None,
    final_output: float | None = None,
) -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = []

    def clip(value: float) -> float:
        return round(max(0.0, min(value, 1.0)), 3)

    for index, _record in enumerate(baseline_records, start=1):
        history.append(
            {
                "date": f"B{index}",
                "label": f"B{index}",
                "phase": "baseline",
                "detail": f"Healthy baseline trace {index}/{len(baseline_records)} captured.",
                "trajectory_drift": 0.01,
                "output_drift": 0.01,
            }
        )

    if event_label and baseline_records:
        history.append(
            {
                "date": "POL",
                "label": "Policy",
                "phase": "event",
                "detail": "Refund policy bundle changed with no deployment.",
                "trajectory_drift": history[-1]["trajectory_drift"],
                "output_drift": history[-1]["output_drift"],
                "event_label": event_label,
            }
        )

    for index in range(1, len(current_records) + 1):
        baseline_prefix = list(baseline_records[:index])
        current_prefix = list(current_records[:index])
        trajectory_drift, output_drift = _compute_live_prefix_drifts(
            baseline_prefix=baseline_prefix,
            current_prefix=current_prefix,
        )
        history.append(
            {
                "date": f"C{index}",
                "label": f"C{index}",
                "phase": "current",
                "detail": f"Current replay trace {index}/{len(current_records)} compared against baseline.",
                "trajectory_drift": clip(trajectory_drift),
                "output_drift": clip(output_drift),
            }
        )

    if history and current_records and final_trajectory is not None and final_output is not None:
        history[-1]["trajectory_drift"] = clip(final_trajectory)
        history[-1]["output_drift"] = clip(final_output)
        history[-1]["detail"] = (
            "Final observer verdict after the full current replay completed."
        )

    return history


def _compute_live_prefix_drifts(
    *,
    baseline_prefix: Sequence[dict[str, Any]],
    current_prefix: Sequence[dict[str, Any]],
) -> tuple[float, float]:
    if not baseline_prefix or not current_prefix:
        return (0.01, 0.01)

    pair_count = min(len(baseline_prefix), len(current_prefix))
    path_deltas: list[float] = []
    output_deltas: list[float] = []

    for baseline_item, current_item in zip(
        baseline_prefix[:pair_count], current_prefix[:pair_count]
    ):
        path_analysis = compare_paths(
            baseline_item.get("steps", []),
            current_item.get("steps", []),
        )
        path_deltas.append(1.0 - float(path_analysis["path_similarity"]))
        output_deltas.append(
            1.0
            - SequenceMatcher(
                a=str(baseline_item.get("output", "")),
                b=str(current_item.get("output", "")),
            ).ratio()
        )

    average_path_delta = sum(path_deltas) / len(path_deltas) if path_deltas else 0.0
    average_output_delta = sum(output_deltas) / len(output_deltas) if output_deltas else 0.0
    tool_usage = compute_tool_usage_drift(baseline_prefix, current_prefix)
    trajectory_drift = max(average_path_delta, float(tool_usage.get("js_divergence", 0.0)))

    return (trajectory_drift, average_output_delta)


def _build_runtime_controls(
    *,
    drift_type: str,
    should_alert: bool,
    behavior_drift_ratio: float,
) -> dict[str, str]:
    affected = f"{behavior_drift_ratio * 100:.0f}%"

    if drift_type == "hidden":
        return {
            "runtime_state": "protected",
            "runtime_action": "Review mode enabled",
            "runtime_message": (
                "Observer agent detected hidden drift and routed risky refund workflows "
                "into human review before the policy change reached more customers."
            ),
            "recommended_next_step": (
                f"Inspect affected traces and require manual approval for the {affected} of queries "
                "whose internal path changed."
            ),
        }

    if drift_type == "severe":
        return {
            "runtime_state": "escalated",
            "runtime_action": "Auto escalation triggered",
            "runtime_message": (
                "Observer agent detected severe drift in both behavior and output and escalated "
                "the workflow for immediate operator intervention."
            ),
            "recommended_next_step": (
                "Pause automated resolution, review the current prompt or policy bundle, and compare "
                "recent traces before re-enabling autonomous actions."
            ),
        }

    if drift_type == "input_drift":
        return {
            "runtime_state": "watching",
            "runtime_action": "Monitoring only",
            "runtime_message": (
                "Query mix shifted, but the agent path remained stable, so the observer keeps "
                "watching without intervening."
            ),
            "recommended_next_step": (
                "Monitor the new query distribution and expand eval coverage if the new query mix "
                "becomes persistent."
            ),
        }

    state = "watching" if should_alert else "healthy"
    return {
        "runtime_state": state,
        "runtime_action": "Monitoring only",
        "runtime_message": (
            "Observer agent sees stable tool routing and normal outputs, so the support agent stays "
            "in standard autonomous mode."
        ),
        "recommended_next_step": (
            "No intervention required. Continue collecting baseline traces and watch for future "
            "policy or model changes."
        ),
    }


def _observer_event(
    stage: str,
    title: str,
    detail: str,
    *,
    status: str = "info",
) -> dict[str, Any]:
    timestamp = time.time()
    return {
        "id": f"{stage}-{int(timestamp * 1000)}",
        "timestamp": timestamp,
        "stage": stage,
        "title": title,
        "detail": detail,
        "status": status,
    }


def _build_live_snapshot(
    *,
    project: str,
    status: str,
    phase_label: str,
    progress_completed: int,
    progress_total: int,
    scenario: str,
    baseline_records: list[dict[str, Any]],
    current_records: list[dict[str, Any]],
    observer_events: list[dict[str, Any]],
) -> dict[str, Any]:
    history = _build_live_run_timeline(
        baseline_records=baseline_records,
        current_records=current_records,
        event_label=_find_history_event_label(observer_events),
    )

    if status == "collecting_baseline":
        runtime_state = "observing"
        runtime_action = "Capturing baseline traces"
        runtime_message = (
            "DriftScope is recording healthy refund trajectories so it can compare the same agent after a policy change."
        )
        next_step = "Keep the dashboard open while the baseline traces stream in."
        live_status_label = f"Baseline {progress_completed}/{progress_total // 2}"
    elif status == "collecting_current":
        runtime_state = "observing"
        runtime_action = "Comparing live traces"
        runtime_message = (
            "Observer agent is watching the same refund workflow run again and checking for path-level changes."
        )
        next_step = "Watch for new tools, path edits, or alert banners as current traces arrive."
        live_status_label = f"Current {max(progress_completed - (progress_total // 2), 0)}/{progress_total // 2}"
    else:
        runtime_state = "analysing"
        runtime_action = "Calculating drift score"
        runtime_message = (
            "DriftScope is running trajectory drift analysis and deciding whether the refund workflow should stay autonomous."
        )
        next_step = "Waiting for observer verdict."
        live_status_label = "Analysing drift"

    return {
        "project": project,
        "generated_at": time.time(),
        "status": status,
        "overall_drift_score": 0,
        "output_drift": 0,
        "trajectory_drift": 0,
        "drift_type": "normal",
        "behavior_drift_ratio": 0,
        "input_drift_ratio": 0,
        "same_path_ratio": 0,
        "baseline_count": len(baseline_records),
        "current_count": len(current_records),
        "should_alert": False,
        "baseline_response_consistency": 1,
        "current_response_consistency": 1,
        "response_consistency_delta": 0,
        "tool_frequency_drift": 0,
        "tool_frequency_changes": [],
        "behavior_drift_examples": [],
        "input_drift_examples": [],
        "history": history,
        "sample_queries": [],
        "runtime_state": runtime_state,
        "runtime_action": runtime_action,
        "runtime_message": runtime_message,
        "recommended_next_step": next_step,
        "observer_events": observer_events,
        "progress_completed": progress_completed,
        "progress_total": progress_total,
        "live_status_label": live_status_label,
        "scenario": scenario,
        "phase_label": phase_label,
    }


def _find_history_event_label(observer_events: Sequence[dict[str, Any]]) -> str | None:
    for event in reversed(observer_events):
        if event.get("stage") == "policy_update":
            return str(event.get("title", "")).strip() or None
    return None


def _build_final_observer_events(
    *,
    drift_type: str,
    runtime_action: str,
    recommended_next_step: str,
    should_alert: bool,
) -> list[dict[str, Any]]:
    if should_alert:
        return [
            _observer_event(
                "protected_mode",
                runtime_action,
                "Observer switched the refund workflow into protected mode before more customers were affected.",
                status="warning",
            ),
            _observer_event(
                "checklist",
                "Remediation checklist generated",
                recommended_next_step,
                status="action",
            ),
        ]

    return [
        _observer_event(
            "healthy",
            "Observer kept the workflow autonomous",
            "No trajectory drift threshold was crossed, so DriftScope stayed in monitoring-only mode.",
            status="success",
        )
    ]


def _maybe_send_owner_alert(
    *,
    analysis: dict[str, Any],
    project: str,
    dashboard_url: str,
) -> dict[str, Any] | None:
    if not analysis.get("should_alert"):
        return None

    email_to = os.environ.get("ALERT_EMAIL_TO", "").strip()
    email_from = os.environ.get("ALERT_EMAIL_FROM", "").strip()
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()

    if not email_to or not email_from or not resend_key:
        return _observer_event(
            "email_skipped",
            "Owner email not delivered automatically",
            "Set ALERT_EMAIL_TO, ALERT_EMAIL_FROM, and RESEND_API_KEY to send the alert automatically during the live demo.",
            status="warning",
        )

    subject = f"[Picnic] DriftScope detected hidden drift for {project}"
    text = "\n".join(
        [
            f"Hi Picnic agent owner,",
            "",
            f"DriftScope detected {analysis.get('drift_type', 'behavior drift')} on agent '{project}'.",
            f"Observer action: {analysis.get('runtime_action', 'Review mode enabled')}",
            "",
            str(analysis.get("runtime_message", "")),
            "",
            "Open the dashboard to inspect the incident:",
            dashboard_url,
            "",
            "Recommended next step:",
            str(analysis.get("recommended_next_step", "")),
        ]
    )

    payload = json.dumps(
        {
            "from": email_from,
            "to": [email_to],
            "subject": subject,
            "text": text,
        }
    ).encode("utf-8")
    req = request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=8) as resp:
            if 200 <= resp.status < 300:
                return _observer_event(
                    "email_sent",
                    "Owner notified automatically",
                    f"Sent incident email to {email_to}. The email links back to the live DriftScope dashboard.",
                    status="success",
                )
    except error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        detail = f"Automatic delivery failed: HTTP {exc.code}."
        if body:
            detail = f"{detail} Provider said: {body}"
        if "resend.dev" in email_from:
            detail += (
                " The resend.dev test sender can only send to the email address associated with your Resend account."
            )
        return _observer_event(
            "email_failed",
            "Owner email failed",
            f"{detail} You can still use the dashboard button to resend the alert.",
            status="warning",
        )
    except (error.URLError, TimeoutError) as exc:
        return _observer_event(
            "email_failed",
            "Owner email failed",
            f"Automatic delivery failed: {exc}. You can still use the dashboard button to resend the alert.",
            status="warning",
        )

    return _observer_event(
        "email_failed",
        "Owner email failed",
        "Resend returned a non-success response. You can still use the dashboard button to resend the alert.",
        status="warning",
    )


def _print_summary(analysis: dict[str, Any], dashboard_url: str) -> None:
    traj  = analysis.get("trajectory_drift", 0)
    out   = analysis.get("output_drift", 0)
    dtype = analysis.get("drift_type", "normal")
    ratio = analysis.get("behavior_drift_ratio", 0)
    action = analysis.get("runtime_action", "Monitoring only")

    _p(f"{_GRN}done{_RST}")
    _p()
    _p(f"{_BLD}{'═' * 60}{_RST}")
    _p(f"{_BLD}  DriftScope Analysis Results{_RST}")
    _p(f"{_BLD}{'═' * 60}{_RST}")
    _p(
        f"  Trajectory Drift : "
        f"{_ORG if traj > 0.3 else _GRN}{traj:.4f}{_RST}"
        f"  {'↑ ABOVE THRESHOLD' if traj > 0.3 else '✓ normal'}"
    )
    _p(
        f"  Output Drift     : "
        f"{_ORG if out > 0.3 else _GRN}{out:.4f}{_RST}"
        f"  {'↑ elevated' if out > 0.3 else '✓ normal (hidden drift!)'}"
    )
    _p(f"  Drift Type       : {_ORG if dtype == 'hidden' else _RED if dtype == 'severe' else _BLD}{dtype.upper()}{_RST}")
    _p(f"  Queries Affected : {_ORG if ratio > 0.2 else _GRN}{ratio * 100:.0f}%{_RST} of current traces")
    _p(f"  Observer Action  : {_ORG if dtype in {'hidden', 'severe'} else _GRN}{action}{_RST}")
    _p()

    if dtype == "hidden":
        _p(f"  {_ORG}⚠  Hidden Drift detected!{_RST}")
        _p(f"  {_DIM}  Output looks normal but internal paths changed.{_RST}")
        _p(f"  {_DIM}  LangSmith would show this agent as healthy.{_RST}")
        _p(f"  {_DIM}  DriftScope caught it from trajectory analysis.{_RST}")
        _p()

    _p(f"  {_GRN}{_BLD}Dashboard ready →{_RST}  {dashboard_url}")
    _p(f"  {_DIM}(run `cd dashboard/web && npm run dev` if not already running){_RST}")
    _p()
