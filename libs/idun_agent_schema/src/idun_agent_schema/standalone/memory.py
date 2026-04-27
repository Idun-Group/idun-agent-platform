"""Standalone memory admin contracts.

Memory is a singleton in standalone (one memory per install). Routes do
not take an id in the URL. GET and PATCH operate on
``/admin/api/v1/memory`` directly. PATCH is upsert. Absence of the row
means the agent uses the in-memory default.

Stored shape mirrors the manager: ``agent_framework`` plus ``memory``
(union of LangGraph CheckpointConfig and ADK SessionServiceConfig).
The framework field tells the assembler which side of the union to map
to (``agent.config.checkpointer`` for LangGraph, ``agent.config.session_service``
for ADK).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.manager.managed_memory import MemoryConfig

from ._base import _CamelModel


class StandaloneMemoryRead(_CamelModel):
    """GET response and the data payload of PATCH responses."""

    model_config = ConfigDict(from_attributes=True)

    agent_framework: AgentFramework
    memory: MemoryConfig
    updated_at: datetime


class StandaloneMemoryPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/memory. All fields optional."""

    agent_framework: AgentFramework | None = None
    memory: MemoryConfig | None = None
