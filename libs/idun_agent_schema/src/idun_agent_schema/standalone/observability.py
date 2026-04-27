"""Standalone observability admin contracts.

Observability providers are a collection in standalone. The manager uses
the engine ``ObservabilityConfig`` (V2) shape directly, so no conversion
is needed at assembly.
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

from idun_agent_schema.engine.observability_v2 import ObservabilityConfig

from ._base import _CamelModel


class StandaloneObservabilityRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    observability: ObservabilityConfig
    created_at: datetime
    updated_at: datetime


class StandaloneObservabilityCreate(_CamelModel):
    """Body for POST /admin/api/v1/observability."""

    name: str
    enabled: bool = True
    observability: ObservabilityConfig


class StandaloneObservabilityPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/observability/{id}."""

    name: str | None = None
    enabled: bool | None = None
    observability: ObservabilityConfig | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
