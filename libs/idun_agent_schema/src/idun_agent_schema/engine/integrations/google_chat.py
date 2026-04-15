"""Google Chat integration configuration."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class GoogleChatIntegrationConfig(BaseModel):
    """Google Chat app configuration.

    Requires a GCP project with the Google Chat API enabled,
    a service account for sending messages, and the project number
    for verifying inbound JWT bearer tokens.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    service_account_credentials_json: str = Field(
        description="Service account credentials JSON for calling the Chat API.",
    )
    project_number: str = Field(
        description="GCP project number used to verify inbound JWT tokens.",
    )
    local_mode: bool = Field(
        default=False,
        description=(
            "When enabled, rewrites the webhook URL from http to https "
            "for JWT audience verification. Use this when developing "
            "behind a TLS-terminating proxy like ngrok."
        ),
    )
