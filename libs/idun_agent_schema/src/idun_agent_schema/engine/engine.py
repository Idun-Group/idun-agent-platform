"""Main engine configuration model."""

from pydantic import BaseModel, Field

from .agent import AgentConfig
from .guardrails import Guardrails
from .mcp_server import MCPServer
from .server import ServerConfig


class EngineConfig(BaseModel):
    """Main engine configuration model for the entire Idun Agent Engine."""

    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig
    mcp_servers: list[MCPServer] | None = None
    guardrails: Guardrails | None = None
