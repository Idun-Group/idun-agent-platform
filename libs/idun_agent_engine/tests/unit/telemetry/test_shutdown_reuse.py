"""Regression test: IdunTelemetry must remain usable after shutdown().

The dataclass holds both a ThreadPoolExecutor in self._executor and a
PostHog client in self._client. After shutdown() halts both, a second
capture() must rebuild them — not silently no-op against a dead pool
or a client whose consumer threads are terminated.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from idun_agent_engine.telemetry import IdunTelemetry


def test_capture_after_shutdown_rebuilds_executor_and_client() -> None:
    """A second capture after shutdown should succeed (executor + client rebuilt)."""
    telemetry = IdunTelemetry(enabled=True)

    # Patch the class (not instance) — IdunTelemetry uses slots=True so
    # instance-attribute monkey-patching raises AttributeError.
    fake_client = MagicMock()
    with patch.object(IdunTelemetry, "_get_client", return_value=fake_client):
        future_a = telemetry.capture("test.event", {"k": 1})
        assert future_a is not None
        future_a.result(timeout=2.0)

        telemetry.shutdown(timeout_seconds=1.0)

        # After shutdown, both _executor and _client must be cleared so
        # the next call rebuilds. Without that, _get_client returns the
        # cached (dead) client and capture silently drops events.
        assert telemetry._executor is None, "executor not reset on shutdown"
        assert telemetry._client is None, "client not reset on shutdown"

        future_b = telemetry.capture("test.event", {"k": 2})
        assert (
            future_b is not None
        ), "capture returned None after shutdown — singleton not rebuilt"
        future_b.result(timeout=2.0)

        telemetry.shutdown(timeout_seconds=1.0)
