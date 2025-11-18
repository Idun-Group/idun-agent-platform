"""Models for configuring input/output guardrails for the engine."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, field_validator, model_validator

from .guardrails_type import GuardrailType


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


class GuardrailBanList(BaseGuardrailConfig):
    """Configuration for ban list guardrail that blocks specific words/phrases."""

    ban_words: Annotated[
        list[str],
        Field(min_length=1, description="List of banned words or phrases to check for"),
    ]

    @field_validator("ban_words")
    @classmethod
    def validate_ban_words(cls, v: list[str]) -> list[str]:
        """Validate that ban_words list is non-empty and contains valid strings."""
        if not v:
            raise ValueError("ban_words list cannot be empty")

        cleaned = [word.strip() for word in v if word and word.strip()]

        if not cleaned:
            raise ValueError("ban_words list must contain at least one non-empty word")

        return cleaned


class LLMGuard(BaseGuardrailConfig):
    """Configuration for LLM-based guardrail using a language model."""

    model_name: Annotated[
        str,
        Field(
            min_length=1,
            max_length=200,
            description="Name of the LLM model to use for guardrail evaluation",
        ),
    ]

    prompt: Annotated[
        str,
        Field(
            min_length=1,
            description="Prompt template for the LLM guardrail",
        ),
    ]

    @field_validator("model_name")
    @classmethod
    def validate_model_name(cls, v: str) -> str:
        """Validate model name format."""
        v = v.strip()
        if not v:
            raise ValueError("model_name cannot be empty or whitespace")
        return v

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        """Validate prompt is not empty."""
        v = v.strip()
        if not v:
            raise ValueError("prompt cannot be empty or whitespace")
        return v


class Guardrail(BaseModel):
    """Base class for defining guardrails."""

    type: GuardrailType = Field(description="Type of guardrail to use")

    config: LLMGuard | GuardrailBanList = Field(
        description="Configuration for the specific guardrail type"
    )

    @model_validator(mode="after")
    def validate_type_config_match(self) -> Guardrail:
        """Validate that the type matches the config class."""
        type_to_config = {
            GuardrailType.CUSTOM_LLM: LLMGuard,
            GuardrailType.GUARDRAILS_HUB: GuardrailBanList,
        }

        expected_config_type = type_to_config.get(self.type)
        if expected_config_type and not isinstance(self.config, expected_config_type):
            raise ValueError(
                f"Guardrail type '{self.type}' expects config of type "
                f"{expected_config_type.__name__}, got {type(self.config).__name__}"
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
