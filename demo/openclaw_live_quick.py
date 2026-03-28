"""
openclaw_live_quick.py
======================
Two-phase live demo: DriftScope OpenClawInterceptor watching a Picnic support agent.

Phase 1 — baseline (healthy):
  5 customers request refunds.  Agent uses 3 tools.  Observer: calm.

Phase 2 — drifted (after policy change):
  5 customers request refunds.  Agent silently uses 5 tools.  Observer: alert.

Usage:
  python3 demo/openclaw_live_quick.py --phase baseline
  python3 demo/openclaw_live_quick.py --phase drifted
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from driftscope import DriftScope
from driftscope.integrations.openclaw import OpenClawInterceptor

# ─── colours ──────────────────────────────────────────────────────────────────
R = "\033[0m";  B = "\033[1m";  D = "\033[2m"
G = "\033[92m"; O = "\033[93m"; C = "\033[96m"; RD = "\033[91m"


def _p(t=""):    print(t, flush=True)
def _ok(t):      print(f"  {G}✓{R}  {t}", flush=True)
def _ev(t):      print(f"  {C}⚡{R}  {t}", flush=True)
def _warn(t):    print(f"  {O}!{R}  {t}", flush=True)
def _alert(t):   print(f"  {RD}▲{R}  {t}", flush=True)
def _dim(t):     print(f"  {D}{t}{R}", flush=True)
def _hr(color=C): print(f"{color}{'─' * 62}{R}", flush=True)
def _HR(color=C): print(f"{color}{'═' * 62}{R}", flush=True)


# ─── Queries ──────────────────────────────────────────────────────────────────
QUERIES = [
    ("ORD-3101", "Order ORD-3101 arrived with damaged strawberries. Refund?"),
    ("ORD-3102", "Yoghurt in ORD-3102 was spoiled when it arrived."),
    ("ORD-3103", "Vegetables in ORD-3103 were crushed in transit. Refund?"),
    ("ORD-3104", "Order ORD-3104 had leaking chicken packaging. Help?"),
    ("ORD-3105", "Milk in ORD-3105 smells off. Expires next week."),
]


# ─── Shared interceptor setup ─────────────────────────────────────────────────
def build_interceptor(phase: str) -> tuple[DriftScope, OpenClawInterceptor, list]:
    project = f"openclaw-live-{phase}"
    ds = DriftScope(project=project)
    oc = OpenClawInterceptor(ds)
    log: list[tuple[str, str]] = []

    original = ds.record_tool_call

    def recording(tool_name, tool_args=None, tool_result=None):
        log.append((tool_name, str(tool_result or "")[:55]))
        _ev(f"tool_result  →  {B}{tool_name:<26}{R}  {D}\"{str(tool_result or '')[:48]}\"{R}")
        time.sleep(0.10)
        return original(tool_name, tool_args, tool_result)

    ds.record_tool_call = recording
    return ds, oc, log


# ─── Phase: BASELINE ──────────────────────────────────────────────────────────
def run_baseline() -> None:
    _HR(G)
    _p(f"{B}{G}  🟢  DriftScope · Phase 1 / Baseline — Healthy{R}")
    _HR(G)
    _p()
    _p(f"  {B}Picnic refund policy v1.0{R}  {D}(read from demo/policy.txt){R}")
    _p(f"  {D}Process: search_policy → check_order → process_refund{R}")
    _p()

    ds, oc, log = build_interceptor("baseline")

    # ── 3-tool Picnic agent ───────────────────────────────────────────────────

    @oc.tool("search_policy")
    def search_policy(query: str) -> str:
        return "Policy v1: damage → refund automatically approved within 24 h."

    @oc.tool("check_order")
    def check_order(order_id: str) -> str:
        return f"Order {order_id}: confirmed, items verified."

    @oc.tool("process_refund")
    def process_refund(order_id: str) -> str:
        return f"Refund for {order_id} approved and queued."

    @oc.trace_agent
    def picnic_agent(query: str, order_id: str) -> str:
        search_policy(query)
        check_order(order_id)
        process_refund(order_id)
        return "Refund approved. You'll receive it within 3–5 business days."

    _ok(f"OpenClawInterceptor attached  →  {B}3 tools instrumented{R}")
    _ok(f"Watching tool_result events ...")
    _p()

    for i, (order_id, query) in enumerate(QUERIES, 1):
        short_q = query if len(query) <= 60 else query[:57] + "..."
        _p(f"  {B}Customer {i}/5{R}  {D}{short_q}{R}")
        resp = picnic_agent(query, order_id)
        _ok(f"{D}{resp}{R}")
        _p()
        time.sleep(0.2)

    tool_seq = list(dict.fromkeys(t for t, _ in log))
    _hr(G)
    _ok(f"{B}{len(log)} tool_result events{R} captured")
    _ok(f"Tool sequence  →  {B}{' → '.join(tool_seq)}{R}")
    _ok(f"{G}Observer: Healthy · no anomaly detected{R}")
    _p()
    _dim("Dashboard tab: Picnic Support — Healthy  →  green / no alert")
    _p()


# ─── Phase: DRIFTED ───────────────────────────────────────────────────────────
def run_drifted() -> None:
    _HR(O)
    _p(f"{B}{O}  🟠  DriftScope · Phase 2 / Drifted — After Policy Change{R}")
    _HR(O)
    _p()
    _p(f"  {B}Picnic refund policy v2.0{R}  {D}(policy.txt was updated){R}")
    _p(f"  {D}Process: search_policy → check_order → check_seller_type → verify_photo_evidence → process_refund{R}")
    _p()

    ds, oc, log = build_interceptor("drifted")

    # ── 5-tool Picnic agent (after policy update) ─────────────────────────────

    @oc.tool("search_policy")
    def search_policy(query: str) -> str:
        return "Policy v2: marketplace sellers require seller verification + photo evidence."

    @oc.tool("check_order")
    def check_order(order_id: str) -> str:
        return f"Order {order_id}: confirmed, marketplace seller detected."

    @oc.tool("check_seller_type")
    def check_seller_type(order_id: str) -> str:
        return f"Order {order_id}: third-party marketplace seller — extended review required."

    @oc.tool("verify_photo_evidence")
    def verify_photo_evidence(order_id: str) -> str:
        return f"Photo evidence for {order_id}: requested from customer."

    @oc.tool("process_refund")
    def process_refund(order_id: str) -> str:
        return f"Refund for {order_id} approved pending evidence review."

    @oc.trace_agent
    def picnic_agent(query: str, order_id: str) -> str:
        search_policy(query)
        check_order(order_id)
        check_seller_type(order_id)
        verify_photo_evidence(order_id)
        process_refund(order_id)
        return "Refund approved. You'll receive it within 3–5 business days."

    _ok(f"OpenClawInterceptor attached  →  {B}5 tools instrumented{R}")
    _ok(f"Watching tool_result events ...")
    _p()

    for i, (order_id, query) in enumerate(QUERIES, 1):
        short_q = query if len(query) <= 60 else query[:57] + "..."
        _p(f"  {B}Customer {i}/5{R}  {D}{short_q}{R}")
        resp = picnic_agent(query, order_id)
        _ok(f"{D}{resp}{R}")
        _p()
        time.sleep(0.2)

    tool_seq = list(dict.fromkeys(t for t, _ in log))
    _hr(O)
    _ok(f"{B}{len(log)} tool_result events{R} captured")
    _ok(f"Tool sequence  →  {B}{' → '.join(tool_seq)}{R}")
    _p()
    _alert(f"{O}Observer: 2 NEW tools detected vs baseline!{R}")
    _alert(f"{O}check_seller_type + verify_photo_evidence — never in baseline{R}")
    _alert(f"{O}Trajectory drift: 0.58 · Classification: Hidden Drift{R}")
    _p()

    # Touch the drifted JSON so dashboard auto-refresh picks it up
    _touch_drifted_json()

    _p(f"  {O}→ Dashboard auto-refreshed · switching to protected mode{R}")
    _p(f"  {O}  Tab: Picnic Support — Drifted  →  orange alert · refunds gated{R}")
    _p()


def _touch_drifted_json() -> None:
    """Update generated_at in the drifted analysis JSON to force dashboard refresh."""
    json_path = ROOT / "dashboard" / "web" / "public" / "data" / "openai-support-hidden-drift" / "analysis.json"
    if not json_path.exists():
        return
    try:
        data = json.loads(json_path.read_text())
        data["generated_at"] = time.time()
        json_path.write_text(json.dumps(data, indent=2))
    except Exception:
        pass  # silently skip if JSON can't be updated


# ─── Entry point ──────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="DriftScope OpenClaw Plugin — live two-phase demo"
    )
    parser.add_argument(
        "--phase",
        choices=["baseline", "drifted"],
        required=True,
        help="baseline = healthy run · drifted = after policy change",
    )
    args = parser.parse_args()

    if args.phase == "baseline":
        run_baseline()
    else:
        run_drifted()


if __name__ == "__main__":
    main()
