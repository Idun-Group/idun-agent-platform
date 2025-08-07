from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, Union, Literal
from urllib.parse import urlparse

class BaseAgentConfig(BaseModel):
    """Base model for agent configurations. It can be extended by specific agent framework configurations."""
    input_schema_definition: Optional[Dict[str, Any]] = Field(default_factory=dict)
    output_schema_definition: Optional[Dict[str, Any]] = Field(default_factory=dict)

class AgentConfig(BaseModel):
    """Configuration for agent specification and settings."""
    name: Optional[str] = None
    type: Literal["LANGGRAPH", "ADK", "CREWAI"] = Field(default="LANGGRAPH")
    config: BaseAgentConfig = Field(default_factory=BaseAgentConfig)
