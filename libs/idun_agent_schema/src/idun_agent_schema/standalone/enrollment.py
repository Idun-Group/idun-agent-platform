"""Standalone enrollment admin contracts.

Enrollment is the placeholder for future Governance Hub integration.
The DB tables and runtime behavior are deferred (spec §"Enrollment");
this module only defines the schema vocabulary so ``runtime_status``
and future enrollment routes can reference stable types.

MVP always reports ``mode = local`` and ``status = not_enrolled``.
"""

from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from ._base import _CamelModel


class StandaloneEnrollmentMode(StrEnum):
    """Top-level enrollment posture."""

    LOCAL = "local"
    ENROLLED = "enrolled"
    MANAGED = "managed"


class StandaloneEnrollmentStatus(StrEnum):
    """Connection state to Governance Hub when enrolled."""

    NOT_ENROLLED = "not_enrolled"
    PENDING = "pending"
    CONNECTED = "connected"
    ERROR = "error"


class StandaloneEnrollmentInfo(_CamelModel):
    """Enrollment payload returned in runtime status."""

    mode: StandaloneEnrollmentMode = StandaloneEnrollmentMode.LOCAL
    status: StandaloneEnrollmentStatus = StandaloneEnrollmentStatus.NOT_ENROLLED
    manager_url: str | None = None
    workspace_id: UUID | None = None
    managed_agent_id: UUID | None = None
    config_revision: int | None = None
