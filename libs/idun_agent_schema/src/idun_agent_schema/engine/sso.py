"""SSO configuration models (engine)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel


class SSOConfiguration(BaseModel):
    """Configuration for Single Sign-On (SSO)."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    provider_type: Literal["okta", "auth0", "entra", "google"] = Field(
        ...,
        description="Type of OIDC provider.",
        alias="providerType"
    )
    issuer: str = Field(
        ...,
        description="OIDC discovery base URL (e.g. https://accounts.google.com)."
    )
    client_id: str = Field(
        ...,
        description="Client ID from the IdP.",
        alias="clientId"
    )
    client_secret: str = Field(
        ...,
        description="Client Secret from the IdP.",
        alias="clientSecret"
    )
    redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/auth/callback",
        description="Redirect URI configured in the IdP application.",
        alias="redirectUri"
    )
    scopes: list[str] = Field(
        default_factory=lambda: ["openid", "profile", "email"],
        description="OIDC scopes to request."
    )
    allowed_algs: list[str] = Field(
        default_factory=lambda: ["RS256", "RS512", "ES256"],
        description="Allowed algorithms for token verification.",
        alias="allowedAlgs"
    )
    jwks_cache_ttl: int = Field(
        default=300,
        description="Time-to-live for JWKS cache in seconds.",
        alias="jwksCacheTtl"
    )
    clock_skew_seconds: int = Field(
        default=60,
        description="Allowed clock skew in seconds for token verification.",
        alias="clockSkewSeconds"
    )
    expected_audiences: list[str] | None = Field(
        default=None,
        description="Optional list of expected audiences for validation.",
        alias="expectedAudiences"
    )
    claim_user_id_path: str | None = Field(
        default=None,
        description="Optional override for user ID claim path.",
        alias="claimUserIdPath"
    )
    claim_email_path: str | None = Field(
        default=None,
        description="Optional override for email claim path.",
        alias="claimEmailPath"
    )
    claim_roles_paths: list[list[str]] | None = Field(
        default=None,
        description="Optional override for roles claim paths (list of key-paths).",
        alias="claimRolesPaths"
    )
    claim_groups_paths: list[list[str]] | None = Field(
        default=None,
        description="Optional override for groups claim paths (list of key-paths).",
        alias="claimGroupsPaths"
    )
    claim_workspace_ids_paths: list[list[str]] | None = Field(
        default=None,
        description="Optional override for workspace IDs claim paths.",
        alias="claimWorkspaceIdsPaths"
    )
