"""Server configuration models (engine)."""

from pydantic import BaseModel, Field


class ServerAPIConfig(BaseModel):
    """API server configuration."""

    port: int = 8000


class ServerConfig(BaseModel):
    """Configuration for the Engine's universal settings."""

    api: ServerAPIConfig = Field(default_factory=ServerAPIConfig)
    as_mcp: bool = Field(
        default=True,
        description="Expose the agent as an MCP server at /mcp",
    )
    mcp_description: str | None = Field(
        default=None,
        description="Custom description for the MCP tool. Falls back to agent name.",
    )
