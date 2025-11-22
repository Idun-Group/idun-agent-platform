"""Models for configuring input/output guardrails for the engine."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, Field, model_validator

from .guardrails_type import GuardrailType


class Guardrail(BaseModel):
    """Base class for defining guardrails."""

    type: GuardrailType = Field(description="Type of guardrail to use")

    config: dict[str, Any] = Field(
        description="Configuration for the specific guardrail type"
    )

    @model_validator(mode="after")
    def validate_type_config_match(self) -> Guardrail:
        """Validate that the config dict has required fields for the type, and the guard_url, that we need to fetch model from the hub."""
        if self.type == GuardrailType.CUSTOM_LLM:
            required_fields = ["prompt", "model_name"]
            for field in required_fields:
                if field not in self.config:
                    raise ValueError(
                        f"CUSTOM_LLM guardrail requires '{field}' in config"
                    )
        elif self.type == GuardrailType.GUARDRAILS_HUB:
            required_fields = [
                "guard",
                "guard_config",
                "guard_url",
                "api_key",
                "reject_message",
            ]
            for field in required_fields:
                if field not in self.config:
                    raise ValueError(
                        f"GUARDRAILS_HUB guardrail requires '{field}' in config"
                    )
        else:
            raise ValueError(
                f"Guard type: {self.type} not recognized or is not yet supported."
            )
        return self


class Guardrails(BaseModel):
    """Class for specifying the engine's Guardrails configuration."""

    enabled: bool = Field(description="enable/disable guardrails")

    input: list[Guardrail] = Field(
        default_factory=list,
        description="List of guardrails to apply to input messages",
    )

    output: list[Guardrail] = Field(
        default_factory=list,
        description="List of guardrails to apply to output messages",
    )

    @model_validator(mode="after")
    def validate_guardrails(self) -> Guardrails:
        """Validate guardrails configuration."""
        if self.enabled and not self.input and not self.output:
            raise ValueError(
                "Guardrails are enabled but no input or output guardrails are configured. "
                "Either disable guardrails or configure at least one guardrail."
            )

        return self


class BaseGuardrailConfig(BaseModel):
    """Base configuration for all guardrail types."""

    message: Annotated[
        str,
        Field(
            min_length=1,
            max_length=500,
            description="Message to return when guardrail is triggered",
        ),
    ] = "Cannot answer"
