"""Capture utilities, including the @ds.trace interceptor."""

from __future__ import annotations

import functools
import time
from concurrent.futures import Future, ThreadPoolExecutor
from contextvars import ContextVar
from typing import Any, Callable, TypeVar

from .store import TrajectoryStore

F = TypeVar("F", bound=Callable[..., Any])

_current_trajectory: ContextVar[list[dict[str, Any]] | None] = ContextVar(
    "_current_trajectory", default=None
)


class DriftScope:
    """Entry point for capturing agent trajectories."""

    def __init__(
        self,
        project: str,
        api_key: str | None = None,
        db_path: str | None = None,
        max_workers: int = 2,
        async_writes: bool = True,
    ):
        self.project = project
        self.api_key = api_key
        self.store = TrajectoryStore(project=project, db_path=db_path)
        self.async_writes = async_writes
        self._executor = (
            ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="driftscope")
            if async_writes
            else None
        )

    def trace(self, func: F) -> F:
        """Decorator that captures tool calls and the final output."""

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            trajectory: list[dict[str, Any]] = []
            token = _current_trajectory.set(trajectory)
            start_time = time.time()

            try:
                result = func(*args, **kwargs)
                record = {
                    "project": self.project,
                    "query": _extract_query(args, kwargs),
                    "steps": trajectory,
                    "output": _safe_to_string(result),
                    "duration": time.time() - start_time,
                    "timestamp": start_time,
                }
                if self._executor is None:
                    self.store.save(record)
                else:
                    self._executor.submit(self.store.save, record)
                return result
            finally:
                _current_trajectory.reset(token)

        return wrapper  # type: ignore[return-value]

    def record_tool_call(
        self, tool_name: str, tool_args: dict[str, Any] | None, tool_result: Any
    ) -> None:
        """Append one tool invocation to the active trajectory, if any."""
        trajectory = _current_trajectory.get()
        if trajectory is None:
            return

        serialized_args = {
            str(key): _truncate(_safe_to_string(value))
            for key, value in (tool_args or {}).items()
        }
        trajectory.append(
            {
                "tool": tool_name,
                "args": serialized_args,
                "result_summary": _truncate(_safe_to_string(tool_result)),
                "timestamp": time.time(),
            }
        )

    def flush(self) -> None:
        """Wait for queued async writes to finish."""
        if self._executor is not None:
            self._executor.shutdown(wait=True, cancel_futures=False)

    def submit_save(self, record: dict[str, Any]) -> Future[int]:
        """Expose async saving for later pipeline stages."""
        if self._executor is None:
            raise RuntimeError("submit_save is unavailable when async_writes is disabled.")
        return self._executor.submit(self.store.save, record)


def _extract_query(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    if args:
        return _safe_to_string(args[0])
    for key in ("query", "question", "input", "message"):
        if key in kwargs:
            return _safe_to_string(kwargs[key])
    if kwargs:
        first_value = next(iter(kwargs.values()))
        return _safe_to_string(first_value)
    return ""


def _truncate(value: str, limit: int = 200) -> str:
    return value[:limit]


def _safe_to_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value)
