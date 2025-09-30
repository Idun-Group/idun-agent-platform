"""Domain entities and enums for Agents and Tenants."""

from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    """Agent status enumeration."""

    DRAFT = "draft"
    ACTIVE = "active"
    INACTIVE = "inactive"
    DEPRECATED = "deprecated"
    ERROR = "error"


class AgentFramework(str, Enum):
    """Supported agent frameworks."""

    LANGGRAPH = "langgraph"
    CREWAI = "crewai"
    AUTOGEN = "autogen"
    CUSTOM = "custom"


class AgentEntity(BaseModel):
    """Agent domain entity."""

    id: UUID = Field(default_factory=uuid4)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    framework: AgentFramework
    status: AgentStatus = Field(default=AgentStatus.DRAFT)

    # Configuration
    config: dict[str, Any] = Field(default_factory=dict)
    environment_variables: dict[str, str] = Field(default_factory=dict)

    # Metadata
    version: str = Field(default="1.0.0")
    tags: list[str] = Field(default_factory=list)

    # Tenant isolation
    tenant_id: UUID

    # Timestamps
    created_at: datetime
    updated_at: datetime
    deployed_at: datetime | None = None

    # Performance metrics
    total_runs: int = Field(default=0)
    success_rate: float | None = Field(None, ge=0.0, le=1.0)
    avg_response_time_ms: float | None = Field(None, ge=0)

    def activate(self) -> None:
        """Transition agent from DRAFT to ACTIVE and set deployment time."""
        if self.status == AgentStatus.DRAFT:
            self.status = AgentStatus.ACTIVE
            self.deployed_at = datetime.now(UTC)
        else:
            raise ValueError(f"Cannot activate agent in {self.status} status")

    def deactivate(self) -> None:
        """Transition agent from ACTIVE to INACTIVE."""
        if self.status == AgentStatus.ACTIVE:
            self.status = AgentStatus.INACTIVE
        else:
            raise ValueError(f"Cannot deactivate agent in {self.status} status")

    def update_metrics(self, success: bool, response_time_ms: float) -> None:
        """Update running success rate and average response time metrics."""
        self.total_runs += 1

        if self.success_rate is None:
            self.success_rate = 1.0 if success else 0.0
        else:
            current_successes = self.success_rate * (self.total_runs - 1)
            if success:
                current_successes += 1
            self.success_rate = current_successes / self.total_runs

        if self.avg_response_time_ms is None:
            self.avg_response_time_ms = response_time_ms
        else:
            total_time = self.avg_response_time_ms * (self.total_runs - 1)
            self.avg_response_time_ms = (total_time + response_time_ms) / self.total_runs

    def can_be_deployed(self) -> bool:
        """Return True if the agent is eligible for deployment."""
        return (
            self.status in [AgentStatus.DRAFT, AgentStatus.INACTIVE]
            and bool(self.name)
            and bool(self.config)
        )


class AgentRunEntity(BaseModel):
    """Agent run domain entity."""

    id: UUID = Field(default_factory=uuid4)
    agent_id: UUID
    tenant_id: UUID

    # Input/Output
    input_data: dict[str, Any]
    output_data: dict[str, Any] | None = None

    # Execution details
    status: str  # running, completed, failed
    started_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None

    # Performance
    response_time_ms: float | None = None
    tokens_used: int | None = None
    cost_usd: float | None = None

    # Tracing
    trace_id: str | None = None
    span_id: str | None = None

    def complete(self, output_data: dict[str, Any], response_time_ms: float) -> None:
        """Mark run as completed with outputs and timing."""
        self.status = "completed"
        self.output_data = output_data
        self.completed_at = datetime.now(UTC)
        self.response_time_ms = response_time_ms

    def fail(self, error_message: str) -> None:
        """Mark run as failed with an error message."""
        self.status = "failed"
        self.error_message = error_message
        self.completed_at = datetime.now(UTC)

    @property
    def is_completed(self) -> bool:
        """Return True if this run has finished (completed or failed)."""
        return self.status in ["completed", "failed"]

    @property
    def was_successful(self) -> bool:
        """Return True if the run completed successfully."""
        return self.status == "completed"


class TenantStatus(str, Enum):
    """Tenant status enumeration."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    DEACTIVATED = "deactivated"


class TenantPlan(str, Enum):
    """Tenant subscription plan."""

    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class TenantEntity(BaseModel):
    """Tenant domain entity."""

    id: UUID = Field(default_factory=uuid4)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)

    # Contact information
    email: str = Field(..., description="Primary contact email")
    website: str | None = Field(None)

    # Status and plan
    status: TenantStatus = Field(default=TenantStatus.ACTIVE)
    plan: TenantPlan = Field(default=TenantPlan.FREE)

    # Settings
    settings: dict[str, Any] = Field(default_factory=dict)

    # Quotas and limits
    max_agents: int = Field(default=5)
    max_runs_per_month: int = Field(default=1000)
    max_storage_mb: int = Field(default=100)

    # Usage tracking
    current_agents: int = Field(default=0)
    current_runs_this_month: int = Field(default=0)
    current_storage_mb: float = Field(default=0.0)

    # Timestamps
    created_at: datetime
    updated_at: datetime
    suspended_at: datetime | None = None

    def can_create_agent(self) -> bool:
        """Return True if tenant has capacity to create a new agent."""
        return self.status == TenantStatus.ACTIVE and self.current_agents < self.max_agents

    def can_run_agent(self) -> bool:
        """Return True if tenant is below monthly run quota."""
        return self.status == TenantStatus.ACTIVE and self.current_runs_this_month < self.max_runs_per_month

    def suspend(self, reason: str) -> None:
        """Suspend tenant and record the reason."""
        self.status = TenantStatus.SUSPENDED
        self.suspended_at = datetime.utcnow()
        self.settings["suspension_reason"] = reason

    def reactivate(self) -> None:
        """Reactivate a previously suspended tenant."""
        if self.status == TenantStatus.SUSPENDED:
            self.status = TenantStatus.ACTIVE
            self.suspended_at = None
            if "suspension_reason" in self.settings:
                del self.settings["suspension_reason"]

    def upgrade_plan(self, new_plan: TenantPlan) -> None:
        """Upgrade plan and adjust quotas accordingly."""
        self.plan = new_plan
        if new_plan == TenantPlan.STARTER:
            self.max_agents = 20
            self.max_runs_per_month = 10000
            self.max_storage_mb = 1000
        elif new_plan == TenantPlan.PROFESSIONAL:
            self.max_agents = 100
            self.max_runs_per_month = 100000
            self.max_storage_mb = 10000
        elif new_plan == TenantPlan.ENTERPRISE:
            self.max_agents = 1000
            self.max_runs_per_month = 1000000
            self.max_storage_mb = 100000

    def increment_usage(self, agents: int = 0, runs: int = 0, storage_mb: float = 0) -> None:
        """Increment tracked usage counters."""
        self.current_agents += agents
        self.current_runs_this_month += runs
        self.current_storage_mb += storage_mb

    def reset_monthly_usage(self) -> None:
        """Reset monthly run counter at billing cycle start."""
        self.current_runs_this_month = 0


class TenantUserEntity(BaseModel):
    """Tenant user domain entity for multi-user tenants."""

    id: UUID = Field(default_factory=uuid4)
    tenant_id: UUID
    user_id: str
    email: str

    # Role and permissions
    role: str = Field(default="member")
    permissions: list[str] = Field(default_factory=list)

    # Status
    is_active: bool = Field(default=True)

    # Timestamps
    joined_at: datetime
    last_active_at: datetime | None = None

    def has_permission(self, permission: str) -> bool:
        """Return True if the user has an explicit permission or is owner."""
        return permission in self.permissions or self.role == "owner"

    def is_admin(self) -> bool:
        """Return True if the user is an admin or owner."""
        return self.role in ["owner", "admin"]
