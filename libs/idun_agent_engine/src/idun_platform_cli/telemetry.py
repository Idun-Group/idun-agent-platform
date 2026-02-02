"""Telemetry utilities for CLI command tracking."""

from __future__ import annotations

import functools
import time
from collections.abc import Callable
from typing import Any, TypeVar

from idun_agent_engine.telemetry import get_telemetry, sanitize_telemetry_config

F = TypeVar("F", bound=Callable[..., Any])


def track_command(command_name: str) -> Callable[[F], F]:
    """Decorator to track CLI command invocations via telemetry.

    Args:
        command_name: The name of the command to track (e.g., "init", "agent serve").

    Returns:
        A decorator that wraps the command function with telemetry tracking.
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            telemetry = get_telemetry()
            start_time = time.time()
            success = True
            error_message: str | None = None

            try:
                return func(*args, **kwargs)
            except Exception as e:
                success = False
                error_message = str(e)
                raise
            finally:
                duration_ms = (time.time() - start_time) * 1000
                telemetry.capture(
                    "cli command invoked",
                    properties={
                        "command": command_name,
                        "arguments": sanitize_telemetry_config(kwargs),
                        "success": success,
                        "error": error_message,
                        "duration_ms": round(duration_ms, 2),
                    },
                )
                telemetry.shutdown(timeout_seconds=0.5)

        return wrapper  # type: ignore[return-value]

    return decorator
