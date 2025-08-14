"""Common agent model definitions."""

from typing import Any

from idun_agent_engine.observability.base import ObservabilityConfig
from pydantic import BaseModel, Field


class BaseAgentConfig(BaseModel):
    """Base model for agent configurations. It can be extended by specific agent framework configurations."""

    name: str | None = Field(default="Unnamed Agent")
    input_schema_definition: dict[str, Any] | None = Field(default_factory=dict)
    output_schema_definition: dict[str, Any] | None = Field(default_factory=dict)
    # Generic observability block
    observability: ObservabilityConfig | None = Field(default=None)
