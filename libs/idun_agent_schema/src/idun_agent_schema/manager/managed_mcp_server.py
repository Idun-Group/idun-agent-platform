"""Main managed MCP server configuration model."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from idun_agent_schema.engine.mcp_server import MCPServer


class ManagedMCPServerCreate(BaseModel):
    """Create managed MCP server model for requests."""

    name: str
    mcp_server: MCPServer = Field(..., description="MCP server configuration")


class ManagedMCPServerRead(BaseModel):
    """Complete managed MCP server model for responses."""

    id: UUID
    project_id: UUID
    name: str
    mcp_server: MCPServer = Field(..., description="MCP server configuration")
    agent_count: int = Field(0, description="Number of agents using this MCP server")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ManagedMCPServerPatch(BaseModel):
    """Full replacement schema for PUT of a managed MCP server."""

    name: str
    mcp_server: MCPServer = Field(..., description="MCP server configuration")


class MCPToolSchema(BaseModel):
    """Schema for a single MCP tool."""

    name: str
    description: str | None = None
    input_schema: dict[str, Any] | None = None


class MCPToolsResponse(BaseModel):
    """Response containing discovered MCP tools."""

    tools: list[MCPToolSchema]
