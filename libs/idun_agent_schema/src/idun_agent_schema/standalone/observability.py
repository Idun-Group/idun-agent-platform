"""Standalone observability admin contracts.

Observability is a singleton in standalone, one provider per install.
Routes do not take an id in the URL. GET and PATCH operate on
``/admin/api/v1/observability`` directly. PATCH is upsert. Absence of
the row means no observability provider is configured.

Stored shape mirrors the engine's ``ObservabilityConfig`` V2 directly,
so no conversion is needed at assembly. The single configured provider
is wrapped in a one element list at assembly time to match the
engine's ``EngineConfig.observability: list`` shape.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict

from idun_agent_schema.engine.observability_v2 import ObservabilityConfig

from ._base import _CamelModel


class StandaloneObservabilityRead(_CamelModel):
    """GET response and the data payload of PATCH responses."""

    model_config = ConfigDict(from_attributes=True)

    observability: ObservabilityConfig
    updated_at: datetime


class StandaloneObservabilityPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/observability. All fields optional."""

    observability: ObservabilityConfig | None = None
