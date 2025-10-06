"""Top-level engine configuration models."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

from .agent import BaseAgentConfig
from .langgraph import LangGraphAgentConfig
from .server import ServerConfig


class AgentType(StrEnum):
    """Enum for the supported agent frameworks."""

    Langgraph = "langgraph"
    ADK = "adk"
    CrewAI = "CREWAI"
    Haystack = "haystack"


class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""

    type: AgentType
    config: BaseAgentConfig | LangGraphAgentConfig = Field(
        default_factory=BaseAgentConfig
    )


class EngineConfig(BaseModel):
    """Main engine configuration model for the entire Idun Agent Engine."""

    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig
