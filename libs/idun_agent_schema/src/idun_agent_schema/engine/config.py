"""Top-level engine configuration models."""

from enum import Enum
from pydantic import BaseModel, Field

from .agent import BaseAgentConfig
from .langgraph import LangGraphAgentConfig
from .server import ServerConfig


class AgentFramework(str, Enum):
    """Supported agent frameworks for engine."""

    LANGGRAPH = "langgraph"
    ADK = "ADK"
    CREWAI = "CREWAI"
    HAYSTACK = "haystack"
    CUSTOM = "custom"


class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""

    type: AgentFramework = Field(default=AgentFramework.LANGGRAPH)
    config: BaseAgentConfig | LangGraphAgentConfig = Field(
        default_factory=BaseAgentConfig
    )


class EngineConfig(BaseModel):
    """Main engine configuration model for the entire Idun Agent Engine."""

    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig
