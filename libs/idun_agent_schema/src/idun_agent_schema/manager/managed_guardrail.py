"""Main managed guardrail configuration model."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from .guardrail_configs import ManagerGuardrailConfig as GuardrailConfig


class ManagedGuardrailCreate(BaseModel):
    """Create managed guardrail model for requests."""

    name: str
    guardrail: GuardrailConfig = Field(..., description="Guardrail configuration")


class ManagedGuardrailRead(BaseModel):
    """Complete managed guardrail model for responses."""

    id: UUID
    project_id: UUID
    name: str
    guardrail: GuardrailConfig = Field(..., description="Guardrail configuration")
    agent_count: int = Field(0, description="Number of agents using this guardrail")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedGuardrailPatch(BaseModel):
    """Full replacement schema for PUT of a managed guardrail."""

    name: str
    guardrail: GuardrailConfig = Field(..., description="Guardrail configuration")
