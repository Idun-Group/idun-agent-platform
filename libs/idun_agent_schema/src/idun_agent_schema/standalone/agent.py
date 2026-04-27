"""Standalone agent admin contracts.

The agent is a singleton in standalone (one agent per install). Routes
do not take an id in the URL. GET and PATCH operate on
``/admin/api/v1/agent`` directly. There is no Create model. The row is
seeded from YAML on first boot or created by the first PATCH if absent.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.manager.managed_agent import AgentStatus

from ._base import _CamelModel


class StandaloneAgentRead(_CamelModel):
    """GET response and the data payload of PATCH responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str | None = None
    name: str
    description: str | None = None
    version: str | None = None
    status: AgentStatus
    base_url: str | None = None
    base_engine_config: EngineConfig
    created_at: datetime
    updated_at: datetime


class StandaloneAgentPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/agent. All fields optional."""

    name: str | None = None
    description: str | None = None
    version: str | None = None
    base_url: str | None = None
    status: AgentStatus | None = None
    base_engine_config: EngineConfig | None = None
