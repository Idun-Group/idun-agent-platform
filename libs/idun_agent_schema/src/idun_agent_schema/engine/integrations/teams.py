"""Microsoft Teams integration configuration (single-tenant Bot Framework)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class TeamsIntegrationConfig(BaseModel):
    """Microsoft Teams integration configuration.

    Single-tenant only: each customer registers their own Microsoft app
    in their own Azure AD and runs their own engine instance against it.
    Authentication uses Bot Framework's ``ConfigurationBotFrameworkAuthentication``
    with ``MicrosoftAppType=SingleTenant`` hardcoded.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    app_id: str = Field(
        description="Microsoft App ID from the Azure AD app registration.",
    )
    app_password: str = Field(
        description="Client secret from the Azure AD app registration.",
    )
    app_tenant_id: str = Field(
        description="Azure AD tenant ID that owns the app registration.",
    )
