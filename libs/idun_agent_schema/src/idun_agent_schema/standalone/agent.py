"""Standalone agent admin contracts.

The agent is a singleton in standalone, one agent per install. Routes do
not take an id in the URL. GET and PATCH operate on
``/admin/api/v1/agent`` directly. There is no Create model. The row is
seeded from YAML on first boot.

PATCH is metadata only. The base engine config and the agent status are
not patchable through this endpoint. To change framework, agent type, or
other heavy fields, the operator edits the YAML and restarts the process.
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

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
    """Body for PATCH /admin/api/v1/agent.

    All fields are optional in the wire payload. Sending null on a
    required underlying column (``name``) is rejected at validation
    time, since clearing those is meaningless for the singleton.
    """

    name: str | None = None
    description: str | None = None
    version: str | None = None
    base_url: str | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
