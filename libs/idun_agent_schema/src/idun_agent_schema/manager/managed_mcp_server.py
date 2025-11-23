"""Main managed MCP server configuration model."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, ConfigDict

from idun_agent_schema.engine.mcp_server import MCPServer
from enum import Enum


class ManagedMCPServerCreate(BaseModel):
    """Create managed MCP server model for requests."""
    name: str
    mcp_server: MCPServer = Field(..., description="MCP server configuration")

class ManagedMCPServerRead(BaseModel):
    """Complete managed MCP server model for responses."""
    id: UUID
    name: str
    mcp_server: MCPServer = Field(..., description="MCP server configuration")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

class ManagedMCPServerPatch(BaseModel):
    """Full replacement schema for PUT of a managed MCP server."""
    name: str
    mcp_server: MCPServer = Field(..., description="MCP server configuration")
