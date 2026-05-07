"""Tests for idun_agent_schema.standalone.mcp_servers."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from idun_agent_schema.standalone import (
    StandaloneMCPServerCreate,
    StandaloneMCPServerPatch,
    StandaloneMCPServerRead,
)


def _sample_mcp_server() -> dict:
    return {
        "name": "github-tools",
        "transport": "stdio",
        "command": "python",
        "args": ["server.py"],
    }


def test_mcp_server_read_round_trip() -> None:
    rid = uuid4()
    payload = {
        "id": str(rid),
        "slug": "github-tools",
        "name": "GitHub Tools",
        "enabled": True,
        "mcpServer": _sample_mcp_server(),
        "createdAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    parsed = StandaloneMCPServerRead.model_validate(payload)
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneMCPServerRead.model_validate(dumped)
    assert reparsed == parsed
    assert "mcpServer" in dumped


def test_mcp_server_create_default_enabled_true() -> None:
    payload = {"name": "GitHub Tools", "mcpServer": _sample_mcp_server()}
    parsed = StandaloneMCPServerCreate.model_validate(payload)
    assert parsed.enabled is True


def test_mcp_server_patch_explicit_null_name_rejects() -> None:
    with pytest.raises(ValidationError) as exc_info:
        StandaloneMCPServerPatch.model_validate({"name": None})
    assert "name cannot be null" in str(exc_info.value)


def test_mcp_server_snake_case_inbound() -> None:
    payload = {"name": "GH", "mcp_server": _sample_mcp_server()}
    parsed = StandaloneMCPServerCreate.model_validate(payload)
    assert parsed.mcp_server.transport == "stdio"
