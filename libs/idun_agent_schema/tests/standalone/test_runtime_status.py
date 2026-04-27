"""Tests for idun_agent_schema.standalone.runtime_status."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from idun_agent_schema.standalone import (
    StandaloneEngineCapabilities,
    StandaloneRuntimeAgent,
    StandaloneRuntimeStatus,
    StandaloneRuntimeStatusKind,
)


def test_runtime_status_kind_values() -> None:
    expected = {"not_configured", "initializing", "running", "error"}
    actual = {member.value for member in StandaloneRuntimeStatusKind}
    assert actual == expected


def test_runtime_status_running_round_trip() -> None:
    payload = {
        "status": "running",
        "agent": {
            "id": str(uuid4()),
            "name": "Ada",
            "framework": "LANGGRAPH",
            "version": "1.0.0",
            "lifecycleStatus": "active",
        },
        "config": {
            "hash": "abc123",
            "lastAppliedAt": datetime.now(UTC).isoformat(),
        },
        "engine": {
            "capabilities": {"streaming": True, "history": True, "threadId": True}
        },
        "reload": {
            "lastStatus": "reloaded",
            "lastMessage": "Saved and reloaded",
            "lastError": None,
            "lastReloadedAt": datetime.now(UTC).isoformat(),
        },
        "mcp": {"configured": 3, "enabled": 2, "failed": []},
        "observability": {"configured": 2, "enabled": 1},
        "enrollment": {"mode": "local", "status": "not_enrolled"},
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneRuntimeStatus.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json", exclude_none=True)
    reparsed = StandaloneRuntimeStatus.model_validate(dumped)
    assert reparsed.status == StandaloneRuntimeStatusKind.RUNNING
    assert reparsed.agent is not None
    assert reparsed.engine is not None
    assert reparsed.engine.capabilities.streaming is True


def test_runtime_status_not_configured_round_trip() -> None:
    """Cold-start payload has only the required nested sections."""

    payload = {
        "status": "not_configured",
        "mcp": {"configured": 0, "enabled": 0, "failed": []},
        "observability": {"configured": 0, "enabled": 0},
        "enrollment": {"mode": "local", "status": "not_enrolled"},
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneRuntimeStatus.model_validate(payload)
    assert parsed.status == StandaloneRuntimeStatusKind.NOT_CONFIGURED
    assert parsed.agent is None
    assert parsed.engine is None


def test_engine_capabilities_camel_case_outbound() -> None:
    caps = StandaloneEngineCapabilities(
        streaming=True, history=False, thread_id=True
    )
    dumped = caps.model_dump(by_alias=True)
    assert dumped == {"streaming": True, "history": False, "threadId": True}


def test_runtime_agent_partial_fields_accepted() -> None:
    agent = StandaloneRuntimeAgent.model_validate({"name": "Ada"})
    assert agent.name == "Ada"
    assert agent.id is None
