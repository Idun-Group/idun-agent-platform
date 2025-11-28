"""Main managed guardrail configuration model."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from idun_agent_schema.engine.guardrails_v2 import GuardrailsV2


class ManagedGuardrailCreate(BaseModel):
    """Create managed guardrail model for requests."""

    name: str
    guardrail: GuardrailsV2 = Field(..., description="Guardrail configuration")


class ManagedGuardrailRead(BaseModel):
    """Complete managed guardrail model for responses."""

    id: UUID
    name: str
    guardrail: GuardrailsV2 = Field(..., description="Guardrail configuration")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedGuardrailPatch(BaseModel):
    """Full replacement schema for PUT of a managed guardrail."""

    name: str
    guardrail: GuardrailsV2 = Field(..., description="Guardrail configuration")
