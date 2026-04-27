"""Tests for idun_agent_schema.standalone.errors."""

from __future__ import annotations

from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)


def test_error_code_includes_phase1_codes() -> None:
    """All ten codes locked in the rework spec must exist."""

    expected = {
        "bad_request",
        "validation_failed",
        "not_found",
        "conflict",
        "reload_failed",
        "auth_required",
        "forbidden",
        "unsupported_mode",
        "rate_limited",
        "internal_error",
    }
    actual = {member.value for member in StandaloneErrorCode}
    assert actual == expected


def test_field_error_round_trip() -> None:
    err = StandaloneFieldError(
        field="agent.config.name", message="required", code="missing"
    )
    dumped = err.model_dump(by_alias=True)
    assert dumped == {
        "field": "agent.config.name",
        "message": "required",
        "code": "missing",
    }
    assert StandaloneFieldError.model_validate(dumped) == err


def test_admin_error_round_trip_with_field_errors() -> None:
    err = StandaloneAdminError(
        code=StandaloneErrorCode.VALIDATION_FAILED,
        message="Body failed validation.",
        field_errors=[
            StandaloneFieldError(field="name", message="required", code="missing"),
        ],
    )
    dumped = err.model_dump(by_alias=True, exclude_none=True)
    assert dumped["code"] == "validation_failed"
    assert dumped["fieldErrors"][0]["field"] == "name"
    assert StandaloneAdminError.model_validate(dumped) == err


def test_admin_error_camel_case_outbound() -> None:
    err = StandaloneAdminError(
        code=StandaloneErrorCode.RATE_LIMITED,
        message="Too many login attempts.",
        details={"retry_after_seconds": 30},
    )
    dumped = err.model_dump(by_alias=True, exclude_none=True)
    assert "fieldErrors" not in dumped
    assert dumped["details"] == {"retry_after_seconds": 30}
