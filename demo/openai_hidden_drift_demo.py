"""
openai_hidden_drift_demo.py
===========================
Real OpenAI-powered support agent with silent trajectory drift.

The final customer resolution remains the same, but the prompt update forces
two extra verification tools before the refund is processed.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from driftscope import DriftPipeline
from demo.openai_demo_support import (
    ALL_TOOLS,
    BASELINE_PROMPT,
    BASE_TOOLS,
    HIDDEN_DRIFT_PROMPT,
    QUERIES,
    require_openai_client,
    run_openai_support_agent,
)


pipeline = DriftPipeline(
    project="openai-support-live",
    baseline_db=Path(tempfile.gettempdir()) / "driftscope_openai_support_live_baseline.db",
    current_db=Path(tempfile.gettempdir()) / "driftscope_openai_support_live_current.db",
    min_samples=4,
    min_baseline=4,
)


def main() -> None:
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

    pipeline.run(
        queries=QUERIES,
        scenario="Same live Picnic refund agent after a silent policy update",
        phase1_label="Phase 1 — Baseline with GPT-4o-mini",
        phase2_label="Phase 2 — Updated policy, same customer answers",
        event_label="Policy Updated",
        kb_update=[
            "+ Check seller type before refund",
            "+ Verify photo evidence before approval",
            "+ Keep customer-facing resolution unchanged when still eligible",
        ],
        dashboard_url="http://localhost:3000/dashboard?project=openai-support-live",
    )


if __name__ == "__main__":
    main()
