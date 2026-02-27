"""Managed integration configuration schemas for the manager API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from idun_agent_schema.engine.integrations import IntegrationConfig


class ManagedIntegrationCreate(BaseModel):
    """Create managed integration configuration request."""

    name: str
    integration: IntegrationConfig = Field(
        ..., description="Integration configuration"
    )


class ManagedIntegrationRead(BaseModel):
    """Complete managed integration configuration response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    integration: IntegrationConfig = Field(
        ..., description="Integration configuration"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedIntegrationPatch(BaseModel):
    """Update managed integration configuration request."""

    name: str
    integration: IntegrationConfig = Field(
        ..., description="Integration configuration"
    )
