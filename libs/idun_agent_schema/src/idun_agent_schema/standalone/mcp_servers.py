"""Standalone MCP server admin contracts.

MCP servers are a collection in standalone. The manager uses the engine
``MCPServer`` shape directly, so no conversion is needed at assembly.

The standalone row's ``enabled`` flag replaces the manager's M:N junction
table for one-agent deployments.
"""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, model_validator

from idun_agent_schema.engine.mcp_server import MCPServer

from ._base import _CamelModel


class StandaloneMCPServerRead(_CamelModel):
    """GET response and the data payload of POST/PATCH/DELETE responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    enabled: bool
    mcp_server: MCPServer
    created_at: datetime
    updated_at: datetime


class StandaloneMCPServerCreate(_CamelModel):
    """Body for POST /admin/api/v1/mcp-servers."""

    name: str
    enabled: bool = True
    mcp_server: MCPServer


class StandaloneMCPServerPatch(_CamelModel):
    """Body for PATCH /admin/api/v1/mcp-servers/{id}."""

    name: str | None = None
    enabled: bool | None = None
    mcp_server: MCPServer | None = None

    @model_validator(mode="after")
    def _no_null_name(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self
