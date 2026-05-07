"""Tests for idun_agent_schema.standalone.diagnostics."""

from __future__ import annotations

from idun_agent_schema.standalone import (
    StandaloneConnectionCheck,
    StandaloneReadyzCheckStatus,
    StandaloneReadyzResponse,
    StandaloneReadyzStatus,
)


def test_connection_check_ok_round_trip() -> None:
    check = StandaloneConnectionCheck(ok=True, details={"tools": ["add", "subtract"]})
    dumped = check.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"ok": True, "details": {"tools": ["add", "subtract"]}}
    assert StandaloneConnectionCheck.model_validate(dumped) == check


def test_connection_check_failure_round_trip() -> None:
    check = StandaloneConnectionCheck(
        ok=False, error="Connection refused: localhost:5432"
    )
    dumped = check.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"ok": False, "error": "Connection refused: localhost:5432"}


def test_readyz_response_round_trip() -> None:
    response = StandaloneReadyzResponse(
        status=StandaloneReadyzStatus.READY,
        checks={
            "database": StandaloneReadyzCheckStatus.OK,
            "engine": StandaloneReadyzCheckStatus.OK,
            "trace_writer": StandaloneReadyzCheckStatus.OK,
        },
    )
    dumped = response.model_dump(by_alias=True, mode="json")
    assert dumped["status"] == "ready"
    assert dumped["checks"]["database"] == "ok"
    reparsed = StandaloneReadyzResponse.model_validate(dumped)
    assert reparsed == response


def test_readyz_response_not_ready() -> None:
    response = StandaloneReadyzResponse(
        status=StandaloneReadyzStatus.NOT_READY,
        checks={"database": StandaloneReadyzCheckStatus.FAIL},
    )
    dumped = response.model_dump(by_alias=True, mode="json")
    assert dumped == {
        "status": "not_ready",
        "checks": {"database": "fail"},
    }
