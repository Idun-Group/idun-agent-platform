"""
Engine Configuration for Idun Agent Engine

This module contains the core configuration models for the entire Engine engine.
These models define the overall structure and validation for the complete system.
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, Union, Literal
from src.server.server_config import ServerConfig
from src.agent_frameworks.base_agent_config import BaseAgentConfig
from src.agent_frameworks.langgraph_agent_config import LangGraphAgentConfig

class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""
    type: Literal["langgraph", "ADK", "CREWAI"] = Field(default="langgraph")
    config: Union[BaseAgentConfig, LangGraphAgentConfig] = Field(default_factory=BaseAgentConfig)

class EngineConfig(BaseModel):
    """
    Main engine configuration model for the entire Idun Agent Engine.
    
    This is the top-level configuration that encompasses both server settings
    and agent configuration. It represents the complete system configuration
    loaded from config.yaml files or built programmatically.
    """
    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig 