from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from openai import OpenAI


MODEL = "gpt-4o-mini"
POLICY_DIR = ROOT / "demo" / "policies"

QUERIES = [
    "Order ORD-3101 arrived with damaged strawberries. Can I get a refund?",
    "The yoghurt in ORD-3102 was spoiled when it got here. Please help.",
    "My vegetables from order ORD-3103 were crushed in transit. Refund request.",
    "Order ORD-3104 had leaking chicken packaging. What happens next?",
    "The milk in ORD-3105 smells off even though it expires next week.",
    "ORD-3106 included broken eggs and damaged tomatoes. Can Picnic refund this?",
]

ORDER_DATA = {
    "ORD-3101": {"amount": 8.40, "seller_type": "picnic_direct", "photo_ok": True, "delivered_hours_ago": 2},
    "ORD-3102": {"amount": 11.20, "seller_type": "picnic_direct", "photo_ok": True, "delivered_hours_ago": 3},
    "ORD-3103": {"amount": 16.80, "seller_type": "picnic_direct", "photo_ok": True, "delivered_hours_ago": 4},
    "ORD-3104": {"amount": 19.50, "seller_type": "picnic_direct", "photo_ok": True, "delivered_hours_ago": 2},
    "ORD-3105": {"amount": 7.90, "seller_type": "picnic_direct", "photo_ok": True, "delivered_hours_ago": 1},
    "ORD-3106": {"amount": 14.60, "seller_type": "picnic_direct", "photo_ok": True, "delivered_hours_ago": 5},
}

def _load_policy(name: str) -> str:
    return (POLICY_DIR / name).read_text(encoding="utf-8").strip()


BASELINE_PROMPT = f"""You are Picnic support.

Current refund policy knowledge:
{_load_policy("refund_policy_v1.md")}

For refund-eligible damaged grocery orders, always follow this exact path:
1. Call search_policy.
2. Call check_order.
3. Call process_refund.

Do not skip tools and do not call any extra tools.
Assume the order is eligible when the tools confirm it."""

HIDDEN_DRIFT_PROMPT = f"""You are Picnic support.

Current refund policy knowledge:
{_load_policy("refund_policy_v2.md")}

A policy note was silently added by operations.
For refund-eligible damaged grocery orders, always follow this exact path:
1. Call search_policy.
2. Call check_order.
3. Call check_seller_type.
4. Call verify_photo_evidence.
5. Call process_refund.

Even after these checks, keep the final customer resolution consistent with the previous policy when the tools confirm eligibility.
Do not skip tools."""

BASE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_policy",
            "description": "Load the refund policy for damaged grocery items.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_order",
            "description": "Fetch order details for the referenced Picnic order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                },
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "process_refund",
            "description": "Approve the refund when the customer is eligible.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                    "amount": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["order_id", "amount", "reason"],
            },
        },
    },
]

EXTRA_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_seller_type",
            "description": "Verify whether the item was sold by Picnic directly or a marketplace seller.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                },
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_photo_evidence",
            "description": "Confirm whether the customer already provided usable photo evidence.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                },
                "required": ["order_id"],
            },
        },
    },
]

ALL_TOOLS = BASE_TOOLS[:2] + EXTRA_TOOLS + BASE_TOOLS[2:]


def require_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("\033[33mERROR: OPENAI_API_KEY not set.\033[0m")
        print("  export OPENAI_API_KEY=sk-...")
        raise SystemExit(1)
    return OpenAI(api_key=api_key)


def run_openai_support_agent(
    client: OpenAI,
    query: str,
    system_prompt: str,
    tools: list[dict[str, Any]],
    record_tool_call: Callable[[str, dict[str, Any] | None, Any], None],
) -> str:
    order_id = extract_order_id(query)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query},
    ]

    for _ in range(8):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0,
        )
        message = response.choices[0].message

        if not message.tool_calls:
            break

        messages.append(message)
        for tool_call in message.tool_calls:
            args = json.loads(tool_call.function.arguments or "{}")
            if "order_id" in required_tool_args(tool_call.function.name) and not args.get("order_id"):
                args["order_id"] = order_id
            if tool_call.function.name == "process_refund":
                args.setdefault("amount", ORDER_DATA[order_id]["amount"])
                args.setdefault("reason", "damaged groceries")
            result = execute_tool(tool_call.function.name, args)
            record_tool_call(tool_call.function.name, args, result)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                }
            )

    return build_customer_reply(order_id)


def execute_tool(name: str, args: dict[str, Any]) -> str:
    order_id = str(args.get("order_id") or "ORD-3101")
    order = ORDER_DATA[order_id]

    if name == "search_policy":
        return json.dumps(
            {
                "policy": "Damaged grocery items reported within 24 hours are eligible for refund.",
                "refund_window_hours": 24,
            }
        )

    if name == "check_order":
        return json.dumps(
            {
                "order_id": order_id,
                "amount": order["amount"],
                "status": "delivered",
                "delivered_hours_ago": order["delivered_hours_ago"],
                "eligible": True,
            }
        )

    if name == "check_seller_type":
        return json.dumps(
            {
                "order_id": order_id,
                "seller_type": order["seller_type"],
                "handled_by_picnic": order["seller_type"] == "picnic_direct",
            }
        )

    if name == "verify_photo_evidence":
        return json.dumps(
            {
                "order_id": order_id,
                "photo_ok": order["photo_ok"],
                "status": "verified",
            }
        )

    if name == "process_refund":
        return json.dumps(
            {
                "order_id": order_id,
                "status": "approved",
                "refund_amount": order["amount"],
                "eta": "3-5 business days",
            }
        )

    return json.dumps({"error": f"Unknown tool: {name}"})


def build_customer_reply(order_id: str) -> str:
    order = ORDER_DATA[order_id]
    return (
        f"Refund approved for {order_id}. "
        f"We will return EUR {order['amount']:.2f} to your original payment method within 3-5 business days."
    )


def extract_order_id(query: str) -> str:
    match = re.search(r"ORD-\d{4}", query)
    if match:
        return match.group(0)
    raise ValueError(f"Could not find order id in query: {query}")


def required_tool_args(tool_name: str) -> set[str]:
    if tool_name == "search_policy":
        return {"query"}
    if tool_name in {"check_order", "check_seller_type", "verify_photo_evidence"}:
        return {"order_id"}
    if tool_name == "process_refund":
        return {"order_id", "amount", "reason"}
    return set()
