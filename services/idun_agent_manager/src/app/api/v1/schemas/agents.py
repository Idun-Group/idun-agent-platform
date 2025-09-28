"""Pydantic schemas for agent API I/O."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.agents.entities import AgentFramework, AgentStatus


# Request schemas
class AgentCreateRequest(BaseModel):
    """Schema for creating an agent."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    framework: AgentFramework
    config: dict[str, Any] = Field(default_factory=dict)
    environment_variables: dict[str, str] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class AgentUpdateRequest(BaseModel):
    """Schema for updating an agent."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    config: dict[str, Any] | None = None
    environment_variables: dict[str, str] | None = None
    tags: list[str] | None = None


class AgentRunRequest(BaseModel):
    """Schema for running an agent."""

    input_data: dict[str, Any]
    trace_id: str | None = Field(None, max_length=100)


# Response schemas
class AgentResponse(BaseModel):
    """Schema for agent responses."""

    id: UUID
    name: str
    description: str | None
    framework: AgentFramework
    status: AgentStatus
    config: dict[str, Any]
    environment_variables: dict[str, str]
    version: str
    tags: list[str]
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime
    deployed_at: datetime | None
    total_runs: int
    success_rate: float | None
    avg_response_time_ms: float | None

    class Config:
        from_attributes = True


class AgentSummaryResponse(BaseModel):
    """Schema for agent summary (list view)."""

    id: UUID
    name: str
    description: str | None
    framework: AgentFramework
    status: AgentStatus
    version: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    total_runs: int
    success_rate: float | None

    class Config:
        from_attributes = True


class AgentRunResponse(BaseModel):
    """Schema for agent run responses."""

    id: UUID
    agent_id: UUID
    tenant_id: UUID
    input_data: dict[str, Any]
    output_data: dict[str, Any] | None
    status: str
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None
    response_time_ms: float | None
    tokens_used: int | None
    cost_usd: float | None
    trace_id: str | None
    span_id: str | None

    class Config:
        from_attributes = True


class AgentRunSummaryResponse(BaseModel):
    """Schema for agent run summary (list view)."""

    id: UUID
    agent_id: UUID
    status: str
    started_at: datetime
    completed_at: datetime | None
    response_time_ms: float | None
    tokens_used: int | None
    cost_usd: float | None

    class Config:
        from_attributes = True


# Pagination schemas
class PaginatedResponse(BaseModel):
    """Base schema for paginated responses."""

    total: int
    limit: int
    offset: int
    has_more: bool


class PaginatedAgentsResponse(PaginatedResponse):
    """Schema for paginated agent responses."""

    items: list[AgentSummaryResponse]


class PaginatedRunsResponse(PaginatedResponse):
    """Schema for paginated run responses."""

    items: list[AgentRunSummaryResponse]


# Statistics schemas
class AgentStatsResponse(BaseModel):
    """Schema for agent statistics."""

    total_agents: int
    active_agents: int
    total_runs_today: int
    total_runs_this_month: int
    avg_success_rate: float | None
    avg_response_time_ms: float | None
