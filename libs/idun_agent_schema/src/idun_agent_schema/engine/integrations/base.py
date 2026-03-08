"""Base integration configuration models."""

from __future__ import annotations

from enum import StrEnum
from typing import Union

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from .discord import DiscordIntegrationConfig
from .slack import SlackIntegrationConfig
from .whatsapp import WhatsAppIntegrationConfig


class IntegrationProvider(StrEnum):
    """Supported integration providers."""

    WHATSAPP = "WHATSAPP"
    DISCORD = "DISCORD"
    SLACK = "SLACK"


class IntegrationConfig(BaseModel):
    """Top-level integration configuration.

    Each integration binds an external messaging provider to the agent.
    When the engine starts, it registers webhook endpoints for each
    enabled integration.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    provider: IntegrationProvider = Field(
        description="The messaging provider type.",
    )
    enabled: bool = Field(
        default=True,
        description="Toggle this integration on or off.",
    )
    config: Union[
        WhatsAppIntegrationConfig, DiscordIntegrationConfig, SlackIntegrationConfig
    ] = Field(
        description="Provider-specific configuration.",
    )

    @model_validator(mode="before")
    @classmethod
    def _coerce_config_type(cls, values: dict) -> dict:
        """Ensure ``config`` is validated against the model matching ``provider``."""
        if not isinstance(values, dict):
            return values

        provider = values.get("provider")
        config = values.get("config")
        if provider is None or config is None:
            return values

        provider_str = str(provider).upper()
        if isinstance(config, dict):
            if provider_str == IntegrationProvider.DISCORD:
                values["config"] = DiscordIntegrationConfig(**config)
            elif provider_str == IntegrationProvider.WHATSAPP:
                values["config"] = WhatsAppIntegrationConfig(**config)
            elif provider_str == IntegrationProvider.SLACK:
                values["config"] = SlackIntegrationConfig(**config)

        return values
