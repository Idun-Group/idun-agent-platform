"""Discord Interactions Endpoint integration configuration."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class DiscordIntegrationConfig(BaseModel):
    """Discord bot configuration for the Interactions Endpoint webhook.

    Requires a Discord application with a bot user created at
    https://discord.com/developers/applications.  The ``public_key`` is used
    to verify Ed25519 signatures on incoming interaction payloads.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    bot_token: str = Field(
        description="Discord bot token (used for REST API calls).",
    )
    application_id: str = Field(
        description="Discord application ID.",
    )
    public_key: str = Field(
        description=(
            "Ed25519 public key from the Discord application settings. "
            "Used to verify interaction webhook signatures."
        ),
    )
    guild_id: str | None = Field(
        default=None,
        description="Optional guild (server) ID to restrict the integration to.",
    )
