"""Standalone integration admin contracts.

Integrations are a collection in standalone. The manager uses the engine
``IntegrationConfig`` shape directly, so no conversion is needed at
assembly. The standalone row's ``enabled`` is the single source of
truth; the inner ``IntegrationConfig.enabled`` is overwritten at
assembly time (Phase 4+ enforces this; the schema does not).
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

from idun_agent_schema.engine.integrations import IntegrationConfig

from ._base import _CamelModel


class StandaloneIntegrationRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    integration: IntegrationConfig
    created_at: datetime
    updated_at: datetime


class StandaloneIntegrationCreate(_CamelModel):
    """Body for POST /admin/api/v1/integrations."""

    name: str
    enabled: bool = True
    integration: IntegrationConfig


class StandaloneIntegrationPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/integrations/{id}.

    The row-level ``enabled`` is the single source of truth at assembly;
    the inner ``IntegrationConfig.enabled`` field is ignored and
    overwritten at assembly time (Phase 4+).
    """

    name: str | None = None
    enabled: bool | None = None
    integration: IntegrationConfig | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
