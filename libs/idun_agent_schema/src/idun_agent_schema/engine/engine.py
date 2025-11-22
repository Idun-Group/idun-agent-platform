"""Main engine configuration model."""

from pydantic import BaseModel, Field

from .agent import AgentConfig
from .guardrails import Guardrails
from .server import ServerConfig


class EngineConfig(BaseModel):
    """Main engine configuration model for the entire Idun Agent Engine."""

    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig
    guardrails: Guardrails
