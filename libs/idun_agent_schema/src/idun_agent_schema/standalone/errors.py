"""Standalone admin API error envelope."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from ._base import _CamelModel


class StandaloneErrorCode(StrEnum):
    """Stable error codes returned by the standalone admin surface."""

    BAD_REQUEST = "bad_request"
    VALIDATION_FAILED = "validation_failed"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    RELOAD_FAILED = "reload_failed"
    AUTH_REQUIRED = "auth_required"
    FORBIDDEN = "forbidden"
    UNSUPPORTED_MODE = "unsupported_mode"
    RATE_LIMITED = "rate_limited"
    INTERNAL_ERROR = "internal_error"


class StandaloneFieldError(_CamelModel):
    """One field-level error.

    Used for both request body validation and assembled-config validation.
    """

    field: str
    message: str
    code: str | None = None


class StandaloneAdminError(_CamelModel):
    """Top-level error body returned by failing admin requests."""

    code: StandaloneErrorCode
    message: str
    details: dict[str, Any] | None = None
    field_errors: list[StandaloneFieldError] | None = None
