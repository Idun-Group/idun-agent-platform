"""Engine Configuration for Idun Agent Engine.

This module contains the core configuration models for the entire Engine engine.
These models define the overall structure and validation for the complete system.
"""

from typing import Literal

from idun_agent_engine.agent.langgraph.langgraph_model import LangGraphAgentConfig
from idun_agent_engine.agent.model import BaseAgentConfig
from idun_agent_engine.server.server_config import ServerConfig
from pydantic import BaseModel, Field


class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""

    type: Literal["langgraph", "ADK", "CREWAI"] = Field(default="langgraph")
    config: BaseAgentConfig | LangGraphAgentConfig = Field(
        default_factory=BaseAgentConfig
    )


class EngineConfig(BaseModel):
    """Main engine configuration model for the entire Idun Agent Engine.

    This is the top-level configuration that encompasses both server settings
    and agent configuration. It represents the complete system configuration
    loaded from config.yaml files or built programmatically.
    """

    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig
