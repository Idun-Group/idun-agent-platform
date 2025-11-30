"""Main engine configuration model."""

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from .agent import AgentConfig
from .mcp_server import MCPServer
from .guardrails import Guardrails as GuardrailsV1
from .server import ServerConfig
from .observability_v2 import ObservabilityConfig
from .guardrails_v2 import GuardrailsV2 as Guardrails


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
