"""Common agent model definitions (engine)."""

from pydantic import BaseModel, Field

from idun_agent_schema.engine.observability import ObservabilityConfig


class BaseAgentConfig(BaseModel):
    """Base model for agent configurations. Extend for specific frameworks."""

    name: str
    input_schema_definition: str | None = Field()
    output_schema_definition: str | None = Field()
    observability: ObservabilityConfig | None = Field(
        default=None,
        description="(Deprecated) Observability config is deprecated and will be removed in a future release.",  # TODO: Remove this in a future release.
        deprecated=True,  # TODO: Remove this in a future release.
    )
