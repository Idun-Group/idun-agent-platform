"""DTOs for Manager operations."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from .domain import AgentFramework, TenantPlan


class AgentCreateDTO(BaseModel):
    """DTO for creating an agent in the application layer."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    framework: AgentFramework
    config: dict[str, Any] = Field(default_factory=dict)
    environment_variables: dict[str, str] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    tenant_id: UUID


class AgentUpdateDTO(BaseModel):
    """DTO for updating an existing agent."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    config: dict[str, Any] | None = None
    environment_variables: dict[str, str] | None = None
    tags: list[str] | None = None


class AgentDeploymentDTO(BaseModel):
    """DTO describing deployment details for an agent."""

    agent_id: UUID
    container_id: str
    endpoint: str
    status: str
    framework: str
    deployed_at: datetime | None = None


class AgentHealthDTO(BaseModel):
    """DTO representing health metrics for an agent instance."""

    agent_id: UUID
    status: str
    uptime: str | None = None
    cpu_usage: str | None = None
    memory_usage: str | None = None
    last_activity: str | None = None
    error: str | None = None


class AgentRunCreateDTO(BaseModel):
    """DTO for creating a new agent run."""

    agent_id: UUID
    tenant_id: UUID
    input_data: dict[str, Any]
    trace_id: str | None = None


class AgentMetricsDTO(BaseModel):
    """DTO for aggregated performance metrics of an agent."""

    agent_id: UUID
    total_runs: int
    success_rate: float | None = Field(None, ge=0.0, le=1.0)
    avg_response_time_ms: float | None = Field(None, ge=0)
    last_run_at: datetime | None = None


class TenantCreateDTO(BaseModel):
    """DTO for creating a tenant."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., description="Primary contact email")
    website: str | None = None
    plan: TenantPlan = Field(default=TenantPlan.FREE)


class TenantUpdateDTO(BaseModel):
    """DTO for updating tenant metadata and settings."""

    name: str | None = Field(None, min_length=1, max_length=255)
    email: str | None = None
    website: str | None = None
    settings: dict[str, Any] | None = None


class TenantUsageDTO(BaseModel):
    """DTO summarizing a tenant's resource usage and quotas."""

    tenant_id: UUID
    current_agents: int
    max_agents: int
    current_runs_this_month: int
    max_runs_per_month: int
    current_storage_mb: float
    max_storage_mb: int
    usage_percentage: dict[str, float]


class TenantQuotaDTO(BaseModel):
    """DTO for updating tenant quotas."""

    max_agents: int | None = None
    max_runs_per_month: int | None = None
    max_storage_mb: int | None = None


class TenantUserCreateDTO(BaseModel):
    """DTO for adding a user to a tenant."""

    tenant_id: UUID
    user_id: str
    email: str
    role: str = Field(default="member")
    permissions: list[str] = Field(default_factory=list)


class TenantUserUpdateDTO(BaseModel):
    """DTO for updating tenant user fields."""

    role: str | None = None
    permissions: list[str] | None = None
    is_active: bool | None = None
