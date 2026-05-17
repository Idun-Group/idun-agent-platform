"""Standalone runtime status admin contract.

Body of GET /admin/api/v1/runtime/status. Provides operational
evidence the admin UI and operators need to understand what the
process is doing right now: which agent is loaded, what the engine
capabilities are, the last reload outcome, and the current MCP /
observability / enrollment posture.

Top-level ``status`` is the cold-start state machine
(not_configured / initializing / running / error). Nested fields are
all nullable so an early-boot or error-state response can omit
sections that aren't ready yet.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from idun_agent_schema.manager.managed_agent import AgentStatus

from ._base import _CamelModel
from .enrollment import StandaloneEnrollmentInfo
from .reload import StandaloneReloadStatus


class StandaloneRuntimeStatusKind(StrEnum):
    """Top-level cold-start state."""

    NOT_CONFIGURED = "not_configured"
    INITIALIZING = "initializing"
    RUNNING = "running"
    ERROR = "error"


class StandaloneRuntimeAgent(_CamelModel):
    """Agent identity slice of the runtime status payload."""

    id: UUID | None = None
    name: str | None = None
    framework: str | None = None
    version: str | None = None
    lifecycle_status: AgentStatus | None = None


class StandaloneRuntimeConfigInfo(_CamelModel):
    """Active config identity (hash + last-applied timestamp)."""

    hash: str | None = None
    last_applied_at: datetime | None = None


class StandaloneEngineCapabilities(_CamelModel):
    """Capability flags surfaced by the engine adapter.

    Structurally mirrors ``idun_agent_schema.engine.capabilities.CapabilityFlags``
    but inherits ``_CamelModel`` to produce camelCase wire keys
    (``threadId`` instead of ``thread_id``) for the standalone admin
    surface. The engine variant uses ``populate_by_name=True`` without
    ``alias_generator``, so direct reuse would emit snake_case on the
    wire, breaking the admin namespace's case convention.
    """

    streaming: bool
    history: bool
    thread_id: bool


class StandaloneRuntimeEngine(_CamelModel):
    """Engine slice of the runtime status payload."""

    capabilities: StandaloneEngineCapabilities


class StandaloneRuntimeReload(_CamelModel):
    """Last reload outcome."""

    last_status: StandaloneReloadStatus | None = None
    last_message: str | None = None
    last_error: str | None = None
    last_reloaded_at: datetime | None = None


class StandaloneRuntimeMCP(_CamelModel):
    """MCP servers slice of the runtime status payload."""

    configured: int
    enabled: int
    failed: list[str]


class StandaloneRuntimeObservability(_CamelModel):
    """Observability providers slice of the runtime status payload."""

    configured: int
    enabled: int


class StandaloneRuntimeStatus(_CamelModel):
    """Top-level runtime status payload."""

    status: StandaloneRuntimeStatusKind
    agent: StandaloneRuntimeAgent | None = None
    config: StandaloneRuntimeConfigInfo | None = None
    engine: StandaloneRuntimeEngine | None = None
    reload: StandaloneRuntimeReload | None = None
    mcp: StandaloneRuntimeMCP
    observability: StandaloneRuntimeObservability
    enrollment: StandaloneEnrollmentInfo
    updated_at: datetime
