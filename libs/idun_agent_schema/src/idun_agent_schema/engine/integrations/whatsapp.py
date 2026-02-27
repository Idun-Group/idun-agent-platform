"""WhatsApp Business Cloud API integration configuration."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class WhatsAppIntegrationConfig(BaseModel):
    """WhatsApp Business Cloud API configuration.

    Requires a Meta Business account with a WhatsApp Business API setup.
    The ``verify_token`` is used by Meta to validate the webhook endpoint
    during initial registration.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    access_token: str = Field(
        description="Meta Graph API permanent access token.",
    )
    phone_number_id: str = Field(
        description="WhatsApp Business phone number ID.",
    )
    verify_token: str = Field(
        description=(
            "Webhook verification token. Must match the token configured "
            "in the Meta App Dashboard webhook settings."
        ),
    )
    api_version: str = Field(
        default="v21.0",
        description="Meta Graph API version.",
    )
