"""
openclaw_live_quick.py
======================
Minimal live proof: DriftScope OpenClawInterceptor is a real, working plugin.

Runs 3 Picnic refund queries in ~5 seconds.
Each tool_result event is intercepted and printed in real-time.

No OpenAI key required — deterministic simulation.
No dashboard write — safe to run mid-demo without touching pre-loaded data.

Usage:
  python3 demo/openclaw_live_quick.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from driftscope import DriftScope
from driftscope.integrations.openclaw import OpenClawInterceptor

# ─── colours ──────────────────────────────────────────────────────────────────
R = "\033[0m"
B = "\033[1m"
D = "\033[2m"
G = "\033[92m"
O = "\033[93m"
C = "\033[96m"


def _p(t=""):  print(t, flush=True)
def _ok(t):    print(f"  {G}✓{R}  {t}", flush=True)
def _ev(t):    print(f"  {C}⚡{R}  {t}", flush=True)
def _dim(t):   print(f"  {D}{t}{R}", flush=True)
def _warn(t):  print(f"  {O}!{R}  {t}", flush=True)


# ─── 3 quick Picnic queries ───────────────────────────────────────────────────
QUERIES = [
    ("ORD-3101", "Order ORD-3101 arrived with damaged strawberries. Refund?"),
    ("ORD-3102", "Yoghurt in ORD-3102 was spoiled when it arrived. Help?"),
    ("ORD-3103", "Vegetables in ORD-3103 were crushed in transit. Refund?"),
]

# ─── Live interception counter ────────────────────────────────────────────────
_intercepted: list[tuple[str, str]] = []


# ─── DriftScope + OpenClawInterceptor ─────────────────────────────────────────
ds = DriftScope(project="openclaw-live-quick")
oc = OpenClawInterceptor(ds)


# Patch record_tool_call to print each event as it fires
_original_record = ds.record_tool_call


def _recording_record(tool_name, tool_args=None, tool_result=None):
    _intercepted.append((tool_name, str(tool_result or "")))
    result_preview = str(tool_result or "")[:55]
    _ev(
        f"tool_result  →  {B}{tool_name:<22}{R}  "
        f"{D}\"{result_preview}\"{R}"
    )
    time.sleep(0.12)
    return _original_record(tool_name, tool_args, tool_result)


ds.record_tool_call = _recording_record  # shadow instance method


# ─── Picnic support tools (wrapped by the interceptor) ────────────────────────

@oc.tool("search_policy")
def search_policy(query: str) -> str:
    return "Refund policy: eligible for damaged items within 24 h."


@oc.tool("check_order")
def check_order(order_id: str) -> str:
    return f"Order {order_id} confirmed, amount EUR verified."


@oc.tool("process_refund")
def process_refund(order_id: str) -> str:
    return f"Refund of EUR approved for {order_id}."


# ─── Picnic support agent (wrapped by the interceptor) ────────────────────────

@oc.trace_agent
def picnic_support_agent(query: str, order_id: str) -> str:
    search_policy(query)
    check_order(order_id)
    process_refund(order_id)
    return "Refund approved. You'll receive it within 3–5 business days."


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    _p()
    _p(f"{B}{C}{'═' * 62}{R}")
    _p(f"{B}{C}  🦞  DriftScope OpenClaw Plugin  ·  Live Proof{R}")
    _p(f"{B}{C}{'═' * 62}{R}")
    _p()

    # ── explain what's happening ──────────────────────────────────────────────
    _p(f"  {B}What's running right now:{R}")
    _dim("  A real DriftScope object is attached to a real OpenClawInterceptor.")
    _dim("  Three Picnic tools are wrapped with @oc.tool(...).")
    _dim("  The agent is wrapped with @oc.trace_agent.")
    _dim("  Every tool_result event fires through the interceptor live.")
    _p()

    _p(f"  {D}ds = DriftScope(project='openclaw-live-quick'){R}")
    _p(f"  {D}oc = OpenClawInterceptor(ds){R}")
    _p()
    _p(f"  {D}@oc.tool('search_policy'){R}")
    _p(f"  {D}def search_policy(query): ...{R}")
    _p()
    _p(f"  {D}@oc.tool('check_order'){R}")
    _p(f"  {D}def check_order(order_id): ...{R}")
    _p()
    _p(f"  {D}@oc.tool('process_refund'){R}")
    _p(f"  {D}def process_refund(order_id): ...{R}")
    _p()

    _ok(f"OpenClawInterceptor attached  →  {B}3 tools instrumented{R}")
    _ok(f"Waiting for tool_result events ...")
    _p()
    time.sleep(0.5)

    # ── run 3 queries ─────────────────────────────────────────────────────────
    _p(f"  {B}── Running 3 Picnic refund queries ──{R}")
    _p()

    for i, (order_id, query) in enumerate(QUERIES, 1):
        short_q = query if len(query) <= 58 else query[:55] + "..."
        _p(f"  {B}Query {i} / {len(QUERIES)}{R}  {D}{short_q}{R}")
        response = picnic_support_agent(query, order_id)
        _ok(f"{D}{response}{R}")
        _p()
        time.sleep(0.25)

    # ── summary ───────────────────────────────────────────────────────────────
    _p(f"{B}{G}{'─' * 62}{R}")
    _ok(f"{B}{len(_intercepted)} tool_result events{R} intercepted by DriftScope")

    tools_seen = list(dict.fromkeys(t for t, _ in _intercepted))
    _ok(f"Tool sequence logged  →  {B}{' → '.join(tools_seen)}{R}")
    _ok(f"Trajectory fingerprints computed  →  ready for drift analysis")
    _p()

    # ── transition ────────────────────────────────────────────────────────────
    _warn(f"A full drift analysis run (12 queries × 2 phases) takes ~2–3 min.")
    _warn(f"We've pre-loaded a completed run — here's what it looks like:")
    _p()
    _p(f"  {C}→ Dashboard: http://localhost:3000{R}")
    _p(f"  {C}  project   : guided-simulated-demo  (always pre-loaded){R}")
    _p()


if __name__ == "__main__":
    main()
