"""Managed SSO configuration schemas for the manager API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from idun_agent_schema.engine.sso import SSOConfig


class ManagedSSOCreate(BaseModel):
    """Create managed SSO configuration request."""

    name: str
    sso: SSOConfig = Field(..., description="SSO (OIDC) configuration")


class ManagedSSORead(BaseModel):
    """Complete managed SSO configuration response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    sso: SSOConfig = Field(..., description="SSO (OIDC) configuration")
    agent_count: int = Field(0, description="Number of agents using this SSO config")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedSSOPatch(BaseModel):
    """Update managed SSO configuration request."""

    name: str
    sso: SSOConfig = Field(..., description="SSO (OIDC) configuration")
