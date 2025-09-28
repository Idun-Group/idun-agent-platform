"""Data Transfer Objects for tenant operations."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.tenants.entities import TenantPlan


class TenantCreateDTO(BaseModel):
    """DTO for creating a tenant."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., description="Primary contact email")
    website: str | None = None
    plan: TenantPlan = Field(default=TenantPlan.FREE)


class TenantUpdateDTO(BaseModel):
    """DTO for updating a tenant."""

    name: str | None = Field(None, min_length=1, max_length=255)
    email: str | None = None
    website: str | None = None
    settings: dict[str, Any] | None = None


class TenantUsageDTO(BaseModel):
    """DTO for tenant usage information."""

    tenant_id: UUID
    current_agents: int
    max_agents: int
    current_runs_this_month: int
    max_runs_per_month: int
    current_storage_mb: float
    max_storage_mb: int
    usage_percentage: dict[str, float]  # {'agents': 0.8, 'runs': 0.45, 'storage': 0.12}


class TenantQuotaDTO(BaseModel):
    """DTO for tenant quota updates."""

    max_agents: int | None = None
    max_runs_per_month: int | None = None
    max_storage_mb: int | None = None


class TenantUserCreateDTO(BaseModel):
    """DTO for adding a user to a tenant."""

    tenant_id: UUID
    user_id: str  # External user ID
    email: str
    role: str = Field(default="member")
    permissions: list[str] = Field(default_factory=list)


class TenantUserUpdateDTO(BaseModel):
    """DTO for updating a tenant user."""

    role: str | None = None
    permissions: list[str] | None = None
    is_active: bool | None = None
