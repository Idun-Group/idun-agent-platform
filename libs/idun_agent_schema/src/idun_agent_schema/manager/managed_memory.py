"""Main managed memory configuration model."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.langgraph import CheckpointConfig


class ManagedMemoryCreate(BaseModel):
    """Create managed memory model for requests."""

    name: str
    agent_framework: AgentFramework = Field(..., description="Agent framework")
    memory: CheckpointConfig = Field(
        ..., description="Memory (checkpoint) configuration"
    )


class ManagedMemoryRead(BaseModel):
    """Complete managed memory model for responses."""

    id: UUID
    name: str
    agent_framework: AgentFramework = Field(..., description="Agent framework")
    memory: CheckpointConfig = Field(
        ..., description="Memory (checkpoint) configuration"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedMemoryPatch(BaseModel):
    """Full replacement schema for PUT of a managed memory."""

    name: str
    agent_framework: AgentFramework = Field(..., description="Agent framework")
    memory: CheckpointConfig = Field(
        ..., description="Memory (checkpoint) configuration"
    )
