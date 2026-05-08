"""Tests for the standalone CLI telemetry decorator.

The decorator wraps each idun command and emits a PostHog event on
entry plus a separate error event when the command raises. We mock
the engine telemetry singleton so tests don't actually post.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


def test_track_command_captures_success_event(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_client = MagicMock()
    monkeypatch.setattr(
        "idun_agent_standalone._telemetry.get_telemetry", lambda: mock_client
    )

    from idun_agent_standalone._telemetry import track_command

    @track_command("setup")
    def fake_cmd() -> str:
        return "ok"

    assert fake_cmd() == "ok"
    mock_client.capture.assert_any_call("cli.setup", {"command": "setup"})
    # No error event on the success path.
    assert not any(
        call.args[0] == "cli.setup.error" for call in mock_client.capture.call_args_list
    )
    mock_client.shutdown.assert_called_once_with(timeout_seconds=1.0)


def test_track_command_captures_error_event_and_reraises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_client = MagicMock()
    monkeypatch.setattr(
        "idun_agent_standalone._telemetry.get_telemetry", lambda: mock_client
    )

    from idun_agent_standalone._telemetry import track_command

    @track_command("init")
    def boom() -> None:
        raise RuntimeError("explode")

    with pytest.raises(RuntimeError, match="explode"):
        boom()

    mock_client.capture.assert_any_call("cli.init", {"command": "init"})
    mock_client.capture.assert_any_call(
        "cli.init.error", {"command": "init", "error_type": "RuntimeError"}
    )
    mock_client.shutdown.assert_called_once_with(timeout_seconds=1.0)


def test_track_command_does_not_crash_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When telemetry is disabled, capture is a no-op but the wrapper
    must still call the wrapped function and return its result."""
    mock_client = MagicMock()
    mock_client.capture.return_value = None
    monkeypatch.setattr(
        "idun_agent_standalone._telemetry.get_telemetry", lambda: mock_client
    )

    from idun_agent_standalone._telemetry import track_command

    @track_command("serve")
    def fake_cmd(value: int) -> int:
        return value * 2

    assert fake_cmd(21) == 42
    mock_client.shutdown.assert_called_once_with(timeout_seconds=1.0)
