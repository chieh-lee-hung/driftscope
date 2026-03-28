"""
guided simulated demo
=====================
Zero-dependency scenario for the landing page demo flow.

It starts with an empty dashboard project and generates a hidden-drift
example with deterministic mock tool calls and terminal-style output.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from driftscope import DriftPipeline


QUERIES = [
    "My apples arrived bruised. Can I get a refund?",
    "The yoghurt I received was spoiled.",
    "My delivery was missing one item.",
    "The eggs in the order were cracked.",
    "The strawberries were mouldy on arrival.",
    "My milk leaked in the bag.",
    "The spinach was wilted when delivered.",
    "The tomatoes were crushed in transit.",
] * 2

pipeline = DriftPipeline(
    project="guided-simulated-demo",
    min_samples=4,
    min_baseline=4,
)


@pipeline.baseline
def baseline_agent(query: str) -> str:
    pipeline.record_tool_call(
        "search_knowledge_base",
        {"query": query},
        "Refund policy loaded.",
    )
    pipeline.record_tool_call(
        "generate_response",
        {"query": query},
        "Response prepared.",
    )
    return "Refund approved. You will receive the refund within 3-5 business days."


@pipeline.current
def current_agent(query: str) -> str:
    pipeline.record_tool_call(
        "search_knowledge_base",
        {"query": query},
        "Refund policy loaded.",
    )
    pipeline.record_tool_call(
        "lookup_order_context",
        {"query": query},
        "Order context loaded.",
    )
    pipeline.record_tool_call(
        "verify_customer_eligibility",
        {"query": query},
        "Eligibility confirmed.",
    )
    pipeline.record_tool_call(
        "generate_response",
        {"query": query},
        "Response prepared.",
    )
    return "Refund approved. You will receive the refund within 3-5 business days."


if __name__ == "__main__":
    pipeline.run(
        queries=QUERIES,
        scenario="Landing-page guided demo with mock traces and deterministic hidden drift",
        phase1_label="Phase 1 — Empty project becomes baseline",
        phase2_label="Phase 2 — Simulated policy change",
        event_label="Policy Updated",
        kb_update=[
            "+ Look up order context before answering",
            "+ Verify customer eligibility before resolution",
        ],
        dashboard_url="http://localhost:3000/dashboard?project=guided-simulated-demo",
    )
