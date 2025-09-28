"""Authentication and authorization adapters."""

from typing import Literal

# Supported OIDC providers for this deployment
ProviderType = Literal["okta", "auth0", "entra", "google"]
