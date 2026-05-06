"""Standalone SSO admin contracts.

SSO is a singleton in standalone, one OIDC provider per install.
Routes do not take an id in the URL. GET and PATCH operate on
``/admin/api/v1/sso`` directly. PATCH is upsert. Absence of the row
means SSO is not configured and agent routes are unprotected.

Stored shape mirrors the engine's ``SSOConfig`` directly, so no
conversion is needed at assembly.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict

from idun_agent_schema.engine.sso import SSOConfig

from ._base import _CamelModel


class StandaloneSsoRead(_CamelModel):
    """GET response and the data payload of PATCH responses."""

    model_config = ConfigDict(from_attributes=True)

    sso: SSOConfig
    updated_at: datetime


class StandaloneSsoPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/sso. All fields optional."""

    sso: SSOConfig | None = None
