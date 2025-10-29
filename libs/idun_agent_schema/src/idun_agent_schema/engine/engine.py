"""Main engine configuration model."""

from pydantic import BaseModel, Field

from .server import ServerConfig
from .agent import AgentConfig


class EngineConfig(BaseModel):
    """Main engine configuration model for the entire Idun Agent Engine."""

    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig
