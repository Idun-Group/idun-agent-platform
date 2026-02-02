"""Main managed agent configuration model."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, ConfigDict

from idun_agent_schema.engine import EngineConfig
from enum import Enum


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
    base_url: str | None = Field(None, description="Base URL")
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
    base_url: str | None = Field(None, description="Base URL")
    engine_config: EngineConfig = Field(
        ..., description="Idun Agent Engine configuration"
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
