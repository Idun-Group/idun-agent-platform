"""Domain entities for tenants - pure business logic, no framework dependencies."""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


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
    slug: str = Field(..., min_length=1, max_length=100)  # URL-friendly identifier
    
    # Contact information
    email: str = Field(..., description="Primary contact email")
    website: Optional[str] = Field(None)
    
    # Status and plan
    status: TenantStatus = Field(default=TenantStatus.ACTIVE)
    plan: TenantPlan = Field(default=TenantPlan.FREE)
    
    # Settings
    settings: Dict[str, any] = Field(default_factory=dict)
    
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
    suspended_at: Optional[datetime] = None
    
    def can_create_agent(self) -> bool:
        """Check if tenant can create a new agent."""
        return (
            self.status == TenantStatus.ACTIVE and
            self.current_agents < self.max_agents
        )
    
    def can_run_agent(self) -> bool:
        """Check if tenant can run an agent."""
        return (
            self.status == TenantStatus.ACTIVE and
            self.current_runs_this_month < self.max_runs_per_month
        )
    
    def suspend(self, reason: str) -> None:
        """Suspend the tenant."""
        self.status = TenantStatus.SUSPENDED
        self.suspended_at = datetime.utcnow()
        self.settings["suspension_reason"] = reason
    
    def reactivate(self) -> None:
        """Reactivate the tenant."""
        if self.status == TenantStatus.SUSPENDED:
            self.status = TenantStatus.ACTIVE
            self.suspended_at = None
            if "suspension_reason" in self.settings:
                del self.settings["suspension_reason"]
    
    def upgrade_plan(self, new_plan: TenantPlan) -> None:
        """Upgrade tenant plan and adjust quotas."""
        self.plan = new_plan
        
        # Adjust quotas based on plan
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
        """Increment usage counters."""
        self.current_agents += agents
        self.current_runs_this_month += runs
        self.current_storage_mb += storage_mb
    
    def reset_monthly_usage(self) -> None:
        """Reset monthly usage counters."""
        self.current_runs_this_month = 0


class TenantUserEntity(BaseModel):
    """Tenant user domain entity for multi-user tenants."""
    
    id: UUID = Field(default_factory=uuid4)
    tenant_id: UUID
    user_id: str  # External user ID (from auth provider)
    email: str
    
    # Role and permissions
    role: str = Field(default="member")  # owner, admin, member, viewer
    permissions: List[str] = Field(default_factory=list)
    
    # Status
    is_active: bool = Field(default=True)
    
    # Timestamps
    joined_at: datetime
    last_active_at: Optional[datetime] = None
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has specific permission."""
        return permission in self.permissions or self.role == "owner"
    
    def is_admin(self) -> bool:
        """Check if user is admin or owner."""
        return self.role in ["owner", "admin"] 