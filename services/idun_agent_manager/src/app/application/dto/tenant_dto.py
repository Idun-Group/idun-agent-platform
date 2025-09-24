"""Data Transfer Objects for tenant operations."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.tenants.entities import TenantPlan, TenantStatus


class TenantCreateDTO(BaseModel):
    """DTO for creating a tenant."""
    
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., description="Primary contact email")
    website: Optional[str] = None
    plan: TenantPlan = Field(default=TenantPlan.FREE)


class TenantUpdateDTO(BaseModel):
    """DTO for updating a tenant."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = None
    website: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class TenantUsageDTO(BaseModel):
    """DTO for tenant usage information."""
    
    tenant_id: UUID
    current_agents: int
    max_agents: int
    current_runs_this_month: int
    max_runs_per_month: int
    current_storage_mb: float
    max_storage_mb: int
    usage_percentage: Dict[str, float]  # {'agents': 0.8, 'runs': 0.45, 'storage': 0.12}


class TenantQuotaDTO(BaseModel):
    """DTO for tenant quota updates."""
    
    max_agents: Optional[int] = None
    max_runs_per_month: Optional[int] = None
    max_storage_mb: Optional[int] = None


class TenantUserCreateDTO(BaseModel):
    """DTO for adding a user to a tenant."""
    
    tenant_id: UUID
    user_id: str  # External user ID
    email: str
    role: str = Field(default="member")
    permissions: List[str] = Field(default_factory=list)


class TenantUserUpdateDTO(BaseModel):
    """DTO for updating a tenant user."""
    
    role: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None
