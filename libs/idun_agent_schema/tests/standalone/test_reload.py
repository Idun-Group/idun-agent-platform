"""Tests for idun_agent_schema.standalone.reload."""

from __future__ import annotations

from idun_agent_schema.standalone import (
    StandaloneReloadResult,
    StandaloneReloadStatus,
)


def test_reload_status_values() -> None:
    expected = {"reloaded", "restart_required", "reload_failed"}
    actual = {member.value for member in StandaloneReloadStatus}
    assert actual == expected


def test_reload_result_round_trip_success() -> None:
    result = StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOADED,
        message="Saved and reloaded",
    )
    dumped = result.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"status": "reloaded", "message": "Saved and reloaded"}
    assert StandaloneReloadResult.model_validate(dumped) == result


def test_reload_result_round_trip_restart_required() -> None:
    result = StandaloneReloadResult(
        status=StandaloneReloadStatus.RESTART_REQUIRED,
        message="Saved. Restart required to apply.",
    )
    dumped = result.model_dump(by_alias=True, exclude_none=True)
    assert dumped["status"] == "restart_required"


def test_reload_result_round_trip_failure() -> None:
    result = StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOAD_FAILED,
        message="Engine reload failed; config not saved.",
        error="ImportError: graph module not found",
    )
    dumped = result.model_dump(by_alias=True)
    assert dumped["error"] == "ImportError: graph module not found"
    assert StandaloneReloadResult.model_validate(dumped) == result
