"""CLI telemetry decorator.

Wraps each idun command so PostHog gets a `cli.<name>` event on entry
and a `cli.<name>.error` event when the command raises. The
underlying client is the engine's process-wide singleton via
``idun_agent_engine.telemetry.get_telemetry`` — we delegate
sanitization, opt-out, and async transport to it.

Each decorated invocation calls ``shutdown(timeout_seconds=1.0)`` in
``finally`` because CLI processes are short-lived and we want events
flushed before exit.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import ParamSpec, TypeVar

from idun_agent_engine.telemetry import get_telemetry

P = ParamSpec("P")
R = TypeVar("R")


def track_command(name: str) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorator that posts cli.<name>[.error] events around a command."""

    def decorator(fn: Callable[P, R]) -> Callable[P, R]:
        @wraps(fn)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            client = get_telemetry()
            client.capture(f"cli.{name}", {"command": name})
            try:
                return fn(*args, **kwargs)
            except Exception as exc:
                client.capture(
                    f"cli.{name}.error",
                    {"command": name, "error_type": type(exc).__name__},
                )
                raise
            finally:
                client.shutdown(timeout_seconds=1.0)

        return wrapper

    return decorator


__all__ = ["track_command"]
