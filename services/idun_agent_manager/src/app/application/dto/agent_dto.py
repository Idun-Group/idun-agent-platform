"""Data Transfer Objects for agent operations."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.agents.entities import AgentFramework


class AgentCreateDTO(BaseModel):
    """DTO for creating an agent."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    framework: AgentFramework
    config: dict[str, Any] = Field(default_factory=dict)
    environment_variables: dict[str, str] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    tenant_id: UUID


class AgentUpdateDTO(BaseModel):
    """DTO for updating an agent."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    config: dict[str, Any] | None = None
    environment_variables: dict[str, str] | None = None
    tags: list[str] | None = None


class AgentDeploymentDTO(BaseModel):
    """DTO for agent deployment information."""

    agent_id: UUID
    container_id: str
    endpoint: str
    status: str
    framework: str
    deployed_at: datetime | None = None


class AgentHealthDTO(BaseModel):
    """DTO for agent health status."""

    agent_id: UUID
    status: str
    uptime: str | None = None
    cpu_usage: str | None = None
    memory_usage: str | None = None
    last_activity: str | None = None
    error: str | None = None


class AgentRunCreateDTO(BaseModel):
    """DTO for creating an agent run."""

    agent_id: UUID
    tenant_id: UUID
    input_data: dict[str, Any]
    trace_id: str | None = None


class AgentMetricsDTO(BaseModel):
    """DTO for agent performance metrics."""

    agent_id: UUID
    total_runs: int
    success_rate: float | None = Field(None, ge=0.0, le=1.0)
    avg_response_time_ms: float | None = Field(None, ge=0)
    last_run_at: datetime | None = None
