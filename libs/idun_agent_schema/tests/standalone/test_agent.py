"""Tests for idun_agent_schema.standalone.agent."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_schema.manager.managed_agent import AgentStatus
from idun_agent_schema.standalone import (
    StandaloneAgentPatch,
    StandaloneAgentRead,
)


def _sample_engine_config() -> EngineConfig:
    return EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )


def test_agent_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "ada",
        "name": "Ada",
        "description": "Research helper",
        "version": "1.0.0",
        "status": "active",
        "baseUrl": "https://localhost:8000",
        "baseEngineConfig": _sample_engine_config().model_dump(mode="json"),
        "createdAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneAgentRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneAgentRead.model_validate(dumped)
    assert reparsed.id == rid
    assert reparsed.status == AgentStatus.ACTIVE
    assert "baseUrl" in dumped
    assert "createdAt" in dumped


def test_agent_read_snake_case_inbound() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "ada",
        "name": "Ada",
        "status": "active",
        "base_url": None,
        "base_engine_config": _sample_engine_config().model_dump(mode="json"),
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneAgentRead.model_validate(payload)
    assert parsed.id == rid


def test_agent_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneAgentPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)


def test_agent_patch_omitted_name_accepts() -> None:
    patch = StandaloneAgentPatch.model_validate({"description": "new"})
    assert patch.name is None
    assert patch.description == "new"


def test_agent_patch_explicit_string_name_accepts() -> None:
    patch = StandaloneAgentPatch.model_validate({"name": "Renamed"})
    assert patch.name == "Renamed"
