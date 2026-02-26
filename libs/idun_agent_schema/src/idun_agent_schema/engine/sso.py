"""SSO (OIDC) configuration model for engine route protection."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class SSOConfig(BaseModel):
    """OIDC Single Sign-On configuration.

    When enabled, the engine validates JWT tokens on protected routes
    (``/agent/invoke``, ``/agent/stream``, ``/agent/copilotkit/stream``)
    against the configured OIDC provider's JWKS endpoint, discovered via
    ``{issuer}/.well-known/openid-configuration``.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    enabled: bool = Field(
        default=True,
        description="Toggle SSO enforcement on protected routes.",
    )
    issuer: str = Field(
        description=(
            "OIDC issuer URL (e.g. https://accounts.google.com). "
            "Used to discover the JWKS endpoint via "
            ".well-known/openid-configuration."
        ),
    )
    client_id: str = Field(
        description=(
            "OAuth 2.0 client ID. Used as the default audience for "
            "JWT validation when 'audience' is not set."
        ),
    )
    audience: str | None = Field(
        default=None,
        description=(
            "Expected JWT 'aud' claim. Defaults to client_id if not set. "
            "Okta client credentials tokens use 'api://default'."
        ),
    )
    allowed_domains: list[str] | None = Field(
        default=None,
        description=(
            "Optional list of allowed email domains "
            "(e.g. ['company.com']). When set, only tokens whose "
            "email claim matches one of these domains are accepted."
        ),
    )
    allowed_emails: list[str] | None = Field(
        default=None,
        description=(
            "Optional list of specific email addresses allowed "
            "access. When set, only tokens whose email claim exactly "
            "matches one of these values are accepted."
        ),
    )
