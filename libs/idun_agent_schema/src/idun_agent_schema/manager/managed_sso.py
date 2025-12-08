"""Main managed SSO configuration model."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from idun_agent_schema.engine.sso import SSOConfiguration


class ManagedSSOCreate(BaseModel):
    """Create managed SSO model for requests."""
    name: str
    sso: SSOConfiguration = Field(..., description="SSO configuration")

class ManagedSSORead(BaseModel):
    """Complete managed SSO model for responses."""
    id: UUID
    name: str
    sso: SSOConfiguration = Field(..., description="SSO configuration")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

class ManagedSSOPatch(BaseModel):
    """Full replacement schema for PUT of a managed SSO."""
    name: str
    sso: SSOConfiguration = Field(..., description="SSO configuration")
