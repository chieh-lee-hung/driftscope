"""
openai_normal_demo.py
=====================
Real OpenAI-powered support agent with no behavior change.

This demo should show a healthy dashboard:
- trajectory drift stays low
- output drift stays low
- no alert is raised
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
    BASELINE_PROMPT,
    BASE_TOOLS,
    QUERIES,
    require_openai_client,
    run_openai_support_agent,
)


pipeline = DriftPipeline(
    project="openai-support-stable",
    baseline_db=Path(tempfile.gettempdir()) / "driftscope_openai_support_stable_baseline.db",
    current_db=Path(tempfile.gettempdir()) / "driftscope_openai_support_stable_current.db",
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
            system_prompt=BASELINE_PROMPT,
            tools=BASE_TOOLS,
            record_tool_call=pipeline.record_tool_call,
        )

    pipeline.run(
        queries=QUERIES,
        scenario="Real OpenAI support agent with identical baseline/current behavior",
        phase1_label="Phase 1 — Baseline with GPT-4o-mini",
        phase2_label="Phase 2 — Same policy, same tool path",
        dashboard_url="http://localhost:3000/dashboard?project=openai-support-stable",
    )


if __name__ == "__main__":
    main()
