"""OpenClaw-specific interceptor integration."""

from __future__ import annotations

import functools
from typing import Any, Callable, TypeVar

from ..capture import DriftScope

F = TypeVar("F", bound=Callable[..., Any])


class OpenClawInterceptor:
    """
    Framework-agnostic adapter for OpenClaw-style agents and tools.

    This integration assumes two extension points that most agent runtimes expose:
    - one wrapper around the top-level agent run
    - one wrapper around each tool function

    Example:

    ```python
    ds = DriftScope(project="openclaw-prod")
    oc = OpenClawInterceptor(ds)

    @oc.trace_agent
    def run_agent(user_message: str) -> str:
        ...

    @oc.tool("search_knowledge_base")
    def search_knowledge_base(query: str) -> str:
        ...
    ```
    """

    def __init__(self, driftscope: DriftScope):
        self.ds = driftscope

    def trace_agent(self, func: F) -> F:
        """Wrap the OpenClaw agent entrypoint with DriftScope tracing."""
        return self.ds.trace(func)

    def tool(self, name: str | None = None) -> Callable[[F], F]:
        """Wrap a tool function so each invocation is recorded automatically."""

        def decorator(func: F) -> F:
            tool_name = name or func.__name__

            @functools.wraps(func)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                result = func(*args, **kwargs)
                self.ds.record_tool_call(
                    tool_name=tool_name,
                    tool_args=_serialize_call_args(args, kwargs),
                    tool_result=result,
                )
                return result

            return wrapper  # type: ignore[return-value]

        return decorator

    def record_step(
        self,
        tool_name: str,
        tool_args: dict[str, Any] | None = None,
        tool_result: Any = None,
    ) -> None:
        """Manual escape hatch when OpenClaw hides tool execution internally."""
        self.ds.record_tool_call(tool_name, tool_args, tool_result)

    def instrument_tool(
        self,
        func: F,
        name: str | None = None,
    ) -> F:
        """Non-decorator variant so integration can patch tools dynamically."""
        return self.tool(name=name)(func)


def wrap_openclaw_agent(driftscope: DriftScope, func: F) -> F:
    """Convenience helper for projects that prefer function-based setup."""
    return OpenClawInterceptor(driftscope).trace_agent(func)


def wrap_openclaw_tool(
    driftscope: DriftScope,
    func: F,
    name: str | None = None,
) -> F:
    """Convenience helper to wrap one tool function."""
    return OpenClawInterceptor(driftscope).instrument_tool(func, name=name)


def _serialize_call_args(
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
) -> dict[str, Any]:
    serialized: dict[str, Any] = {}
    for index, value in enumerate(args):
        serialized[f"arg_{index}"] = value
    for key, value in kwargs.items():
        serialized[str(key)] = value
    return serialized
