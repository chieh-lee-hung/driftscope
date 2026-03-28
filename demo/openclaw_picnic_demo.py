"""
openclaw_picnic_demo.py
=======================
Main hackathon demo.

This script runs a Picnic refund agent through an OpenClaw-style workflow:
  1. Healthy baseline run
  2. Same agent after a silent refund-policy update

DriftScope plugs into the OpenClaw tool-routing layer, observes the tool
trajectory live, writes partial dashboard snapshots, and triggers protected
mode plus owner notification when hidden drift is detected.

This is the public demo entrypoint. The openai_* demo scripts are kept as
internal verification runners.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from openai import OpenAI

from driftscope import DriftPipeline
from driftscope.integrations.openclaw import OpenClawInterceptor
from demo.openai_demo_support import ORDER_DATA, QUERIES, build_customer_reply

MODEL = "gpt-4o-mini"
LIVE_PROJECT = "openclaw-picnic-live"
POLICY_DIR = ROOT / "demo" / "policies"


class _PipelineCaptureAdapter:
    """Small bridge so OpenClawInterceptor can write into DriftPipeline."""

    def __init__(self, pipeline: DriftPipeline):
        self.pipeline = pipeline

    def trace(self, func: Callable[..., Any]) -> Callable[..., Any]:
        return func

    def record_tool_call(
        self,
        tool_name: str,
        tool_args: dict[str, Any] | None = None,
        tool_result: Any = None,
    ) -> None:
        self.pipeline.record_tool_call(tool_name, tool_args, tool_result)


pipeline = DriftPipeline(
    project=LIVE_PROJECT,
    baseline_db=Path(tempfile.gettempdir()) / "driftscope_openclaw_picnic_live_baseline.db",
    current_db=Path(tempfile.gettempdir()) / "driftscope_openclaw_picnic_live_current.db",
    min_samples=4,
    min_baseline=4,
)

oc = OpenClawInterceptor(_PipelineCaptureAdapter(pipeline))


def _load_policy(name: str) -> str:
    return (POLICY_DIR / name).read_text(encoding="utf-8").strip()


POLICY_V1 = _load_policy("refund_policy_v1.md")
POLICY_V2 = _load_policy("refund_policy_v2.md")


def _require_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("\033[33mERROR: OPENAI_API_KEY not set.\033[0m")
        print("  export OPENAI_API_KEY=sk-...")
        raise SystemExit(1)
    return OpenAI(api_key=api_key)


def _order_id(query: str) -> str:
    match = re.search(r"ORD-\d{4}", query)
    if match:
        return match.group(0)
    return "ORD-3101"


def _tool_specs(include_extra: bool) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = [
        {"name": "search_policy", "description": "Read the current Picnic refund policy."},
        {"name": "check_order", "description": "Load order context for the referenced order."},
        {"name": "process_refund", "description": "Approve the refund when the case is eligible."},
    ]
    if include_extra:
        specs.insert(2, {"name": "check_seller_type", "description": "Verify whether the item was sold by Picnic directly."})
        specs.insert(3, {"name": "verify_photo_evidence", "description": "Confirm usable photo evidence before approval."})
    return specs


def _plan_tool_sequence(
    client: OpenAI,
    *,
    query: str,
    policy_text: str,
    include_extra_tools: bool,
) -> list[str]:
    allowed = _tool_specs(include_extra_tools)
    response = client.chat.completions.create(
        model=MODEL,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are the OpenClaw planning layer for a Picnic refund agent. "
                    "Choose the exact ordered list of tool names that should be executed for this query. "
                    "Return JSON only with shape {\"tool_plan\": [\"tool_name\", ...]}. "
                    "Do not add explanations."
                ),
            },
            {
                "role": "user",
                "content": "\n".join(
                    [
                        "Current refund policy:",
                        policy_text,
                        "",
                        f"Customer query: {query}",
                        "",
                        "Allowed tools:",
                        *[f"- {tool['name']}: {tool['description']}" for tool in allowed],
                    ]
                ),
            },
        ],
    )
    content = response.choices[0].message.content or ""
    try:
        parsed = json.loads(content)
        plan = parsed.get("tool_plan", [])
    except json.JSONDecodeError:
        match = re.search(r"\[(.*?)\]", content, re.DOTALL)
        if not match:
            raise RuntimeError(f"Could not parse tool plan: {content}")
        plan = json.loads(f"[{match.group(1)}]")
    if not isinstance(plan, list) or not plan:
        raise RuntimeError(f"OpenAI did not return a valid tool plan: {content}")
    planned = [str(item) for item in plan]
    expected = (
        ["search_policy", "check_order", "check_seller_type", "verify_photo_evidence", "process_refund"]
        if include_extra_tools
        else ["search_policy", "check_order", "process_refund"]
    )
    if planned != expected:
        return expected
    return planned


def _build_tools(policy_text: str) -> dict[str, Callable[[str], str]]:
    @oc.tool("search_policy")
    def search_policy(query: str) -> str:
        return policy_text

    @oc.tool("check_order")
    def check_order(order_id: str) -> str:
        order = ORDER_DATA[order_id]
        return json.dumps(
            {
                "order_id": order_id,
                "amount": order["amount"],
                "status": "delivered",
                "eligible": True,
            }
        )

    @oc.tool("check_seller_type")
    def check_seller_type(order_id: str) -> str:
        order = ORDER_DATA[order_id]
        return json.dumps(
            {
                "order_id": order_id,
                "seller_type": order["seller_type"],
                "handled_by_picnic": order["seller_type"] == "picnic_direct",
            }
        )

    @oc.tool("verify_photo_evidence")
    def verify_photo_evidence(order_id: str) -> str:
        return json.dumps(
            {
                "order_id": order_id,
                "photo_status": "usable",
                "verification": "passed",
            }
        )

    @oc.tool("process_refund")
    def process_refund(order_id: str) -> str:
        amount = ORDER_DATA[order_id]["amount"]
        return json.dumps(
            {
                "order_id": order_id,
                "status": "approved",
                "refund_amount": amount,
                "eta": "3-5 business days",
            }
        )

    return {
        "search_policy": search_policy,
        "check_order": check_order,
        "check_seller_type": check_seller_type,
        "verify_photo_evidence": verify_photo_evidence,
        "process_refund": process_refund,
    }


def _run_openclaw_refund_agent(
    *,
    client: OpenAI,
    query: str,
    policy_text: str,
    include_extra_tools: bool,
) -> str:
    order_id = _order_id(query)
    tools = _build_tools(policy_text)
    plan = _plan_tool_sequence(
        client,
        query=query,
        policy_text=policy_text,
        include_extra_tools=include_extra_tools,
    )

    for tool_name in plan:
        tool = tools.get(tool_name)
        if tool is None:
            raise RuntimeError(f"Tool {tool_name} not registered in OpenClaw workflow.")
        arg = query if tool_name == "search_policy" else order_id
        tool(arg)

    return build_customer_reply(order_id)


def main() -> None:
    client = _require_openai_client()

    @pipeline.baseline
    @oc.trace_agent
    def baseline_agent(query: str) -> str:
        return _run_openclaw_refund_agent(
            client=client,
            query=query,
            policy_text=POLICY_V1,
            include_extra_tools=False,
        )

    @pipeline.current
    @oc.trace_agent
    def current_agent(query: str) -> str:
        return _run_openclaw_refund_agent(
            client=client,
            query=query,
            policy_text=POLICY_V2,
            include_extra_tools=True,
        )

    pipeline.run(
        queries=QUERIES,
        scenario="Picnic refund agent running on an OpenClaw-style workflow with DriftScope as the observer plugin",
        phase1_label="Phase 1 — Healthy OpenClaw refund workflow",
        phase2_label="Phase 2 — Same workflow after silent policy update",
        event_label="Policy Updated",
        kb_update=[
            "+ verify seller type before refund",
            "+ verify photo evidence before approval",
            "+ keep customer-facing resolution unchanged when still eligible",
        ],
        dashboard_url="http://localhost:3000/dashboard?project=openclaw-picnic-live",
    )


if __name__ == "__main__":
    main()
