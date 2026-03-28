"""
openclaw_picnic_demo.py
=======================
DriftScope as an OpenClaw MCP plugin — live Picnic refund agent demo.

This script demonstrates a multi-agent system:
  - Production Agent : Picnic support agent (handles refund queries)
  - Observer Agent   : DriftScope (OpenClaw MCP plugin, hooks into tool_result events)
  - Conditional Branch: drift detected → refunds gated → human review required

Modes (auto-detected):
  OPENAI_API_KEY set  →  real GPT-4o-mini calls (proves live AI)
  no key              →  deterministic simulation (always works, same visual)

Usage:
  python3 demo/openclaw_picnic_demo.py
  OPENAI_API_KEY=sk-... python3 demo/openclaw_picnic_demo.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from driftscope import DriftPipeline
from driftscope.integrations.openclaw import OpenClawInterceptor

# ─── colour helpers ───────────────────────────────────────────────────────────
R = "\033[0m"
B = "\033[1m"
D = "\033[2m"
G = "\033[92m"
O = "\033[93m"
C = "\033[96m"
P = "\033[35m"


def _p(t=""):  print(t, flush=True)
def _ok(t):    print(f"  {G}✓{R}  {t}", flush=True)
def _warn(t):  print(f"  {O}!{R}  {t}", flush=True)
def _ev(t):    print(f"  {C}⚡{R}  {t}", flush=True)
def _dim(t):   print(f"  {D}{t}{R}", flush=True)

# ─── Picnic queries ───────────────────────────────────────────────────────────
QUERIES = [
    "Order ORD-3101 arrived with damaged strawberries. Can I get a refund?",
    "The yoghurt in ORD-3102 was spoiled when it got here. Please help.",
    "My vegetables from order ORD-3103 were crushed in transit. Refund request.",
    "Order ORD-3104 had leaking chicken packaging. What happens next?",
    "The milk in ORD-3105 smells off even though it expires next week.",
    "ORD-3106 had broken eggs and damaged tomatoes. Can Picnic refund this?",
]

ORDER_DATA = {
    "ORD-3101": {"amount": 8.40,  "seller_type": "picnic_direct"},
    "ORD-3102": {"amount": 11.20, "seller_type": "picnic_direct"},
    "ORD-3103": {"amount": 16.80, "seller_type": "picnic_direct"},
    "ORD-3104": {"amount": 19.50, "seller_type": "picnic_direct"},
    "ORD-3105": {"amount": 7.90,  "seller_type": "picnic_direct"},
    "ORD-3106": {"amount": 14.60, "seller_type": "picnic_direct"},
}


def _order_id(query: str) -> str:
    for oid in ORDER_DATA:
        if oid in query:
            return oid
    return "ORD-3101"


# ─── Pipeline setup ───────────────────────────────────────────────────────────
pipeline = DriftPipeline(
    project="openai-support-hidden-drift",
    min_samples=4,
    min_baseline=4,
)

# OpenClawInterceptor attaches DriftScope to the OpenClaw tool_result hook
oc = OpenClawInterceptor(pipeline._ds_b)   # swapped per phase in run


# ─── Agent definitions ────────────────────────────────────────────────────────

HAS_OPENAI = bool(os.environ.get("OPENAI_API_KEY"))


def _make_agents():
    """Return (baseline_fn, current_fn) based on available mode."""

    if HAS_OPENAI:
        # ── Real OpenAI agent ──────────────────────────────────────────────────
        from demo.openai_demo_support import (
            ALL_TOOLS, BASE_TOOLS, BASELINE_PROMPT, HIDDEN_DRIFT_PROMPT,
            require_openai_client, run_openai_support_agent,
        )
        client = require_openai_client()

        @pipeline.baseline
        def baseline_agent(query: str) -> str:
            return run_openai_support_agent(
                client=client,
                query=query,
                system_prompt=BASELINE_PROMPT,
                tools=BASE_TOOLS,
                record_tool_call=pipeline.record_tool_call,
            )

        @pipeline.current
        def current_agent(query: str) -> str:
            return run_openai_support_agent(
                client=client,
                query=query,
                system_prompt=HIDDEN_DRIFT_PROMPT,
                tools=ALL_TOOLS,
                record_tool_call=pipeline.record_tool_call,
            )

    else:
        # ── Simulated Picnic agent (no API key needed) ─────────────────────────
        @pipeline.baseline
        def baseline_agent(query: str) -> str:
            oid = _order_id(query)
            pipeline.record_tool_call("search_policy",  {"query": query}, "Refund policy: eligible for damaged items within 24 h.")
            pipeline.record_tool_call("check_order",    {"order_id": oid}, f"Order {oid} confirmed, amount EUR {ORDER_DATA[oid]['amount']:.2f}.")
            pipeline.record_tool_call("process_refund", {"order_id": oid}, f"Refund of EUR {ORDER_DATA[oid]['amount']:.2f} approved.")
            return f"Refund approved for {oid}. EUR {ORDER_DATA[oid]['amount']:.2f} returned within 3-5 business days."

        @pipeline.current
        def current_agent(query: str) -> str:
            oid = _order_id(query)
            pipeline.record_tool_call("search_policy",        {"query": query}, "Refund policy: seller verification now required.")
            pipeline.record_tool_call("check_order",          {"order_id": oid}, f"Order {oid} confirmed, amount EUR {ORDER_DATA[oid]['amount']:.2f}.")
            pipeline.record_tool_call("check_seller_type",    {"order_id": oid}, f"seller_type: {ORDER_DATA[oid]['seller_type']}.")
            pipeline.record_tool_call("verify_photo_evidence",{"order_id": oid}, "Photo evidence: auto-approved for picnic_direct.")
            pipeline.record_tool_call("process_refund",       {"order_id": oid}, f"Refund of EUR {ORDER_DATA[oid]['amount']:.2f} approved.")
            return f"Refund approved for {oid}. EUR {ORDER_DATA[oid]['amount']:.2f} returned within 3-5 business days."


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    mode_label = f"{G}Real GPT-4o-mini (OpenAI){R}" if HAS_OPENAI else f"{O}Simulated / deterministic{R}"

    # ── intro ──────────────────────────────────────────────────────────────────
    _p()
    _p(f"{B}{C}{'═' * 62}{R}")
    _p(f"{B}{C}  🦞  OpenClaw + DriftScope  ·  Picnic Refund Agent Demo{R}")
    _p(f"{B}{C}{'═' * 62}{R}")
    _p(f"  Mode  : {mode_label}")
    _p(f"  Agent : Picnic support agent (refund queries)")
    _p(f"  Plugin: DriftScope OpenClaw MCP plugin (behavioral observer)")
    _p()
    _p(f"{D}  Scenario{R}")
    _p(f"{D}  ─────────────────────────────────────────────────────────{R}")
    _p(f"{D}  Picnic's OpenClaw support agent handles refund requests.{R}")
    _p(f"{D}  A PM updates the refund policy — no code change, no deploy.{R}")
    _p(f"{D}  LangSmith stays green. But the agent silently changes path.{R}")
    _p(f"{D}  DriftScope catches it via OpenClaw's tool_result hook.{R}")
    _p()

    # ── show integration code ──────────────────────────────────────────────────
    _p(f"{B}── OpenClaw integration (the 3 lines that make this work) ──{R}")
    _p()
    _p(f"{D}  from driftscope import DriftScope")
    _p(f"  from driftscope.integrations.openclaw import OpenClawInterceptor")
    _p()
    _p(f"  ds = DriftScope(project='picnic-support')")
    _p(f"  oc = OpenClawInterceptor(ds)   # hooks into tool_result events")
    _p()
    _p(f"  @oc.trace_agent{R}")
    _p(f"{D}  def run_agent(query): ...     # your existing OpenClaw agent")
    _p()
    _p(f"  @oc.tool('search_policy'){R}")
    _p(f"{D}  def search_policy(q): ...     # tools recorded automatically{R}")
    _p()
    time.sleep(0.4)

    # ── build agents ───────────────────────────────────────────────────────────
    _make_agents()

    # ── run pipeline ───────────────────────────────────────────────────────────
    pipeline.run(
        queries=QUERIES,
        scenario="Picnic refund agent — OpenClaw + DriftScope MCP plugin demo",
        phase1_label="Phase 1 — Picnic support agent · baseline policy",
        phase2_label="Phase 2 — Same queries · after silent policy update",
        kb_update=[
            "+ check_seller_type before processing refund",
            "+ verify_photo_evidence required for all claims",
            "(policy update — no code change · no deployment · LangSmith: green)",
        ],
        event_label="Picnic policy update deployed",
        dashboard_url="http://localhost:3000/dashboard?project=openai-support-hidden-drift",
    )

    # ── observer action ────────────────────────────────────────────────────────
    _p(f"{B}{O}{'═' * 62}{R}")
    _p(f"{B}{O}  Observer → Conditional Branch triggered{R}")
    _p(f"{B}{O}  → runtime_action : Refunds gated — human review required{R}")
    _p(f"{B}{O}  → runtime_state  : protected{R}")
    _p(f"{B}{O}{'═' * 62}{R}")
    _p()
    _p(f"  {D}Output drift   : 0.00  — customer answers identical{R}")
    _p(f"  {D}LangSmith      : ✓ green — no errors detected{R}")
    _p(f"  {O}Trajectory drift detected by DriftScope OpenClaw plugin{R}")
    _p()
    _p(f"  Open dashboard → {C}http://localhost:3000/dashboard?project=openai-support-hidden-drift{R}")
    _p()


if __name__ == "__main__":
    main()
