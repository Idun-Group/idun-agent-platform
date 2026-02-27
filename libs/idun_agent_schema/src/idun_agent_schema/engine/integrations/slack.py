"""Slack integration configuration."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class SlackIntegrationConfig(BaseModel):
    """Slack Events API configuration.

    Requires a Slack app with a bot token and signing secret.
    The ``signing_secret`` is used to verify incoming webhook requests
    via HMAC-SHA256.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    bot_token: str = Field(
        description="Slack bot token (xoxb-...).",
    )
    signing_secret: str = Field(
        description="Signing secret for verifying webhook requests.",
    )
