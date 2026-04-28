"""Tests for idun_agent_schema.standalone.memory."""

from __future__ import annotations

from datetime import UTC, datetime

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.standalone import (
    StandaloneMemoryPatch,
    StandaloneMemoryRead,
)


def test_memory_read_round_trip_langgraph() -> None:
    payload = {
        "agentFramework": "LANGGRAPH",
        "memory": {"type": "memory"},
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneMemoryRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneMemoryRead.model_validate(dumped)
    assert reparsed.agent_framework == AgentFramework.LANGGRAPH
    assert "agentFramework" in dumped
    assert "updatedAt" in dumped


def test_memory_read_snake_case_inbound() -> None:
    payload = {
        "agent_framework": "LANGGRAPH",
        "memory": {"type": "memory"},
        "updated_at": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneMemoryRead.model_validate(payload)
    assert parsed.agent_framework == AgentFramework.LANGGRAPH


def test_memory_patch_accepts_partial() -> None:
    patch = StandaloneMemoryPatch.model_validate({"agentFramework": "ADK"})
    assert patch.agent_framework == AgentFramework.ADK
    assert patch.memory is None


def test_memory_patch_accepts_empty() -> None:
    patch = StandaloneMemoryPatch.model_validate({})
    assert patch.agent_framework is None
    assert patch.memory is None
