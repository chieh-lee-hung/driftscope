"""LangChain callback integration."""

from __future__ import annotations

import time
from typing import Any

from ..capture import DriftScope

try:
    from langchain_core.callbacks.base import BaseCallbackHandler
except ImportError:
    try:
        from langchain.callbacks.base import BaseCallbackHandler  # type: ignore
    except ImportError:
        BaseCallbackHandler = object  # type: ignore[misc,assignment]


class DriftScopeCallback(BaseCallbackHandler):
    """
    Capture LangChain tool activity and append it to the active DriftScope trace.

    Typical usage:

    ```python
    ds = DriftScope(project="customer-support")
    callback = DriftScopeCallback(ds)

    @ds.trace
    def run_agent(query: str) -> str:
        return chain.invoke(
            {"input": query},
            config={"callbacks": [callback]},
        )
    ```
    """

    raise_error = False

    def __init__(self, driftscope: DriftScope):
        self.ds = driftscope
        self._tool_starts: dict[str, dict[str, Any]] = {}

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        run_id: Any = None,
        inputs: dict[str, Any] | None = None,
        **_: Any,
    ) -> None:
        tool_name = self._extract_tool_name(serialized)
        self._tool_starts[str(run_id)] = {
            "tool_name": tool_name,
            "input_str": input_str,
            "inputs": inputs or {},
            "started_at": time.time(),
        }

    def on_tool_end(self, output: Any, run_id: Any = None, **_: Any) -> None:
        tool_run = self._tool_starts.pop(str(run_id), None)
        if tool_run is None:
            return

        tool_args = self._format_tool_args(
            tool_run["input_str"],
            tool_run["inputs"],
            tool_run["started_at"],
        )
        self.ds.record_tool_call(tool_run["tool_name"], tool_args, output)

    def on_tool_error(self, error: BaseException, run_id: Any = None, **_: Any) -> None:
        tool_run = self._tool_starts.pop(str(run_id), None)
        if tool_run is None:
            return

        tool_args = self._format_tool_args(
            tool_run["input_str"],
            tool_run["inputs"],
            tool_run["started_at"],
        )
        self.ds.record_tool_call(
            tool_run["tool_name"],
            tool_args,
            f"ERROR: {error}",
        )

    def _extract_tool_name(self, serialized: dict[str, Any]) -> str:
        return (
            serialized.get("name")
            or serialized.get("id")
            or serialized.get("lc")
            or "unknown_tool"
        )

    def _format_tool_args(
        self,
        input_str: str,
        inputs: dict[str, Any],
        started_at: float,
    ) -> dict[str, Any]:
        duration_ms = int((time.time() - started_at) * 1000)
        formatted: dict[str, Any] = {"input": input_str, "duration_ms": duration_ms}
        for key, value in inputs.items():
            formatted[str(key)] = value
        return formatted
