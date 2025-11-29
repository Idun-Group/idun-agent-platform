"""Main managed observability configuration model."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, ConfigDict

from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from enum import Enum


class ManagedObservabilityCreate(BaseModel):
    """Create managed observability model for requests."""
    name: str
    observability: ObservabilityConfig = Field(..., description="Observability configuration")

class ManagedObservabilityRead(BaseModel):
    """Complete managed observability model for responses."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    observability: ObservabilityConfig = Field(..., description="Observability configuration")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

class ManagedObservabilityPatch(BaseModel):
    """Full replacement schema for PUT of a managed observability."""
    name: str
    observability: ObservabilityConfig = Field(..., description="Observability configuration")
