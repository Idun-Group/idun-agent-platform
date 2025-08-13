from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from src.observability.base import ObservabilityConfig


class BaseAgentConfig(BaseModel):
    """Base model for agent configurations. It can be extended by specific agent framework configurations."""
    name: Optional[str] = Field(default="Unnamed Agent")
    input_schema_definition: Optional[Dict[str, Any]] = Field(default_factory=dict)
    output_schema_definition: Optional[Dict[str, Any]] = Field(default_factory=dict)
    # Generic observability block
    observability: Optional[ObservabilityConfig] = Field(default=None)


