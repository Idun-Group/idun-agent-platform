"""Main managed agent configuration model."""

from datetime import datetime
from enum import Enum
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


# class ManagedAgentBase(BaseModel):
#     """Base model for managed agent configuration."""

#     id: UUID = Field(, description="Agent UUID")
#     name: str
#     status: AgentStatus = Field(AgentStatus.DRAFT, description="Agent status")
#     version: str | None = Field(None, description="Agent version")
#     engine_config: EngineConfig = Field(..., description="Idun Agent Engine configuration")
#     created_at: datetime = Field(..., description="Creation timestamp")
#     updated_at: datetime = Field(..., description="Last update timestamp")
#     agent_hash: str | None = Field(default=None, description="Agent hash")


class ManagedAgentCreate(BaseModel):
    """Create managed agent model for requests."""

    name: str
    version: str | None = Field(None, description="Agent version")
    engine_config: EngineConfig = Field(
        ..., description="Idun Agent Engine configuration"
    )


class ManagedAgentRead(BaseModel):
    """Complete managed agent model for responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    status: AgentStatus = Field(AgentStatus.DRAFT, description="Agent status")
    version: str | None = Field(None, description="Agent version")
    engine_config: EngineConfig = Field(
        ..., description="Idun Agent Engine configuration"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedAgentPatch(BaseModel):
    """Full replacement schema for PUT of a managed agent."""

    name: str
    engine_config: EngineConfig = Field(
        ..., description="Idun Agent Engine configuration"
    )
