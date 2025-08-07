from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, Union, Literal
from urllib.parse import urlparse

class BaseAgentConfig(BaseModel):
    """Base model for agent configurations. It can be extended by specific agent framework configurations."""
    name: Optional[str] = Field(default="Unnamed Agent")
    input_schema_definition: Optional[Dict[str, Any]] = Field(default_factory=dict)
    output_schema_definition: Optional[Dict[str, Any]] = Field(default_factory=dict)

