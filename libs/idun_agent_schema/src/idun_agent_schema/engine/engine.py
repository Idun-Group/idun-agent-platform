"""Main engine configuration model."""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from .agent import AgentConfig
from .guardrails_v2 import GuardrailsV2 as Guardrails
from .mcp_server import MCPServer
from .observability_v2 import ObservabilityConfig
from .server import ServerConfig


class EngineConfig(BaseModel):
    """Main engine configuration model for the entire Idun Agent Engine."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig
    mcp_servers: list[MCPServer] | None = Field(default=None, alias="mcpServers")
    guardrails: Guardrails | None = None
    observability: list[ObservabilityConfig] | None = None
