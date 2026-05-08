"""Regression test: IdunTelemetry must remain usable after shutdown().

The dataclass holds a ThreadPoolExecutor in self._executor that gets
shut down on shutdown(). Without resetting that field, the singleton
becomes dead-on-arrival for the next capture() call, breaking the
"shutdown per CLI invocation" pattern used by the standalone CLI's
track_command decorator.
"""

from __future__ import annotations

from unittest.mock import patch

from idun_agent_engine.telemetry import IdunTelemetry


def test_capture_after_shutdown_does_not_raise() -> None:
    """A second capture after shutdown should succeed (executor rebuilt)."""
    telemetry = IdunTelemetry(enabled=True)

    # Force the executor to materialize without making a real network call.
    # Patch the class (not instance) because IdunTelemetry uses slots=True.
    with patch.object(IdunTelemetry, "_get_client", return_value=None):
        future_a = telemetry.capture("test.event", {"k": 1})
        assert future_a is not None
        future_a.result(timeout=2.0)

        telemetry.shutdown(timeout_seconds=1.0)

        future_b = telemetry.capture("test.event", {"k": 2})
        assert future_b is not None, "capture returned None after shutdown — executor was not rebuilt"
        future_b.result(timeout=2.0)

        telemetry.shutdown(timeout_seconds=1.0)
