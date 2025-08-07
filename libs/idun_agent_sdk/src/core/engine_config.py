"""
Engine Configuration for Idun Agent SDK

This module contains the core configuration models for the entire SDK engine.
These models define the overall structure and validation for the complete system.
"""

from pydantic import BaseModel, Field
from typing import Dict, Any
from src.server.server_config import ServerConfig
from src.agent_frameworks.base_agent_config import AgentConfig

class EngineConfig(BaseModel):
    """
    Main engine configuration model for the entire Idun Agent SDK.
    
    This is the top-level configuration that encompasses both server settings
    and agent configuration. It represents the complete system configuration
    loaded from config.yaml files or built programmatically.
    """
    server: ServerConfig = Field(default_factory=ServerConfig)
    agent: AgentConfig 