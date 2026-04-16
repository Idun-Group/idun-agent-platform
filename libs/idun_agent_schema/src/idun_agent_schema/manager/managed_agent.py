"""Main managed agent configuration model."""

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from idun_agent_schema.engine import EngineConfig


class AgentStatus(str, Enum):
    """Agent status enumeration."""

    DRAFT = "draft"
    ACTIVE = "active"
    INACTIVE = "inactive"
    DEPRECATED = "deprecated"
    ERROR = "error"


class GuardrailRef(BaseModel):
    """Reference to a managed guardrail with position metadata."""

    id: UUID
    position: Literal["input", "output"] = "input"
    sort_order: int = 0


class AgentResourceIds(BaseModel):
    """Resource IDs for agent associations (source of truth for relations)."""

    memory_id: UUID | None = None
    sso_id: UUID | None = None
    guardrail_ids: list[GuardrailRef] | None = None
    mcp_server_ids: list[UUID] | None = None
    observability_ids: list[UUID] | None = None
    integration_ids: list[UUID] | None = None


class ManagedAgentCreate(BaseModel):
    """Create managed agent model for requests."""

    name: str
    version: str | None = Field(None, description="Agent version")
    base_url: str | None = Field(None, description="Base URL")
    engine_config: EngineConfig = Field(
        ..., description="Idun Agent Engine configuration"
    )
    resources: AgentResourceIds | None = Field(
        None, description="Resource references (FK/junction)"
    )


class ManagedAgentRead(BaseModel):
    """Complete managed agent model for responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    name: str
    status: AgentStatus = Field(AgentStatus.DRAFT, description="Agent status")
    version: str | None = Field(None, description="Agent version")
    base_url: str | None = Field(None, description="Base URL")
    engine_config: dict[str, Any] = Field(
        ..., description="Materialized EngineConfig (full assembled config)"
    )
    resources: AgentResourceIds | None = Field(
        None, description="Resource references (FK/junction)"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedAgentPatch(BaseModel):
    """Full replacement schema for PUT of a managed agent."""

    name: str
    base_url: str | None = Field(None, description="Base URL")
    engine_config: EngineConfig = Field(
        ..., description="Idun Agent Engine configuration"
    )
    resources: AgentResourceIds | None = Field(
        None, description="Resource references (FK/junction)"
    )


class ManagedAgentStatusUpdate(BaseModel):
    """Schema for updating only the agent status."""

    status: AgentStatus = Field(..., description="New agent status")
