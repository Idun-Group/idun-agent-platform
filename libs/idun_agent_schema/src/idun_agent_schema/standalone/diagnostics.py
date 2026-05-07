"""Standalone diagnostics admin contracts.

Connection-check responses and the readyz probe response. Connection
checks are MVP scope per the rework spec — the admin UI uses them to
validate provider reachability before saving a config.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from ._base import _CamelModel


class StandaloneConnectionCheck(_CamelModel):
    """Body of POST /admin/api/v1/<resource>/check-connection.

    ``ok = True`` means the provider responded as expected. ``details``
    carries provider-specific information (e.g. tool list for an MCP
    server). ``error`` is set only when ``ok = False``.
    """

    ok: bool
    details: dict[str, Any] | None = None
    error: str | None = None


class StandaloneReadyzCheckStatus(StrEnum):
    """Per-check readiness state in a readyz response."""

    OK = "ok"
    FAIL = "fail"


class StandaloneReadyzStatus(StrEnum):
    """Overall readiness state."""

    READY = "ready"
    NOT_READY = "not_ready"


class StandaloneReadyzResponse(_CamelModel):
    """Body of GET /admin/api/v1/readyz."""

    status: StandaloneReadyzStatus
    checks: dict[str, StandaloneReadyzCheckStatus]
