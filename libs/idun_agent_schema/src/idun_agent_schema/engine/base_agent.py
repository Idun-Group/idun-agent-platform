"""Common agent model definitions (engine)."""

from typing import Any

from pydantic import BaseModel, Field

from idun_agent_schema.engine.observability import ObservabilityConfig


class BaseAgentConfig(BaseModel):
    """Base model for agent configurations. Extend for specific frameworks."""

    name: str
    input_schema_definition: dict[str, Any] | None = Field(default_factory=dict)
    output_schema_definition: dict[str, Any] | None = Field(default_factory=dict)
    observability: ObservabilityConfig | None = Field(
        default=None,
        description="(Deprecated) Observability config is deprecated and will be removed in a future release.",  # TODO: Remove this in a future release.
        deprecated=True,  # TODO: Remove this in a future release.
    )
