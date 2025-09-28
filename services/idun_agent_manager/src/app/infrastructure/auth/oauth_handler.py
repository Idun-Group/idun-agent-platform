"""OAuth2/OIDC authentication handler."""

from typing import Any

from authlib.integrations.httpx_client import AsyncOAuth2Client

from app.core.errors import AuthenticationError, ValidationError
from app.core.logging import get_logger
from app.core.settings import get_settings

logger = get_logger(__name__)


class OAuthHandler:
    """OAuth2/OIDC authentication handler."""

    def __init__(self) -> None:
        """Initialize OAuth handler."""
        self.settings = get_settings()
        self._client: AsyncOAuth2Client | None = None

    async def get_client(self) -> AsyncOAuth2Client:
        """Get or create OAuth client."""
        if self._client is None:
            if not all(
                [
                    self.settings.auth.oauth_client_id,
                    self.settings.auth.oauth_client_secret,
                    self.settings.auth.oauth_server_url,
                ]
            ):
                raise ValidationError("OAuth configuration incomplete")

            self._client = AsyncOAuth2Client(
                client_id=self.settings.auth.oauth_client_id,
                client_secret=self.settings.auth.oauth_client_secret,
                server_metadata_url=f"{self.settings.auth.oauth_server_url}/.well-known/openid-configuration",
            )
            await self._client.load_server_metadata()

        return self._client

    async def get_authorization_url(self, state: str) -> str:
        """Get OAuth authorization URL."""
        try:
            client = await self.get_client()
            auth_url, _ = client.create_authorization_url(
                redirect_uri=self.settings.auth.oauth_redirect_uri,
                state=state,
                scope="openid profile email",
            )
            return auth_url
        except Exception as e:
            logger.error("Failed to create authorization URL", error=str(e))
            raise AuthenticationError("Failed to create authorization URL") from e

    async def exchange_code_for_token(self, code: str, state: str) -> dict[str, Any]:
        """Exchange authorization code for access token."""
        try:
            client = await self.get_client()
            token = await client.fetch_token(
                code=code, redirect_uri=self.settings.auth.oauth_redirect_uri
            )
            return token
        except Exception as e:
            logger.error("Failed to exchange code for token", error=str(e))
            raise AuthenticationError("Failed to exchange authorization code") from e

    async def get_user_info(self, access_token: str) -> dict[str, Any]:
        """Get user information from access token."""
        try:
            client = await self.get_client()
            client.token = {"access_token": access_token}

            response = await client.get(client.server_metadata["userinfo_endpoint"])
            response.raise_for_status()

            return response.json()
        except Exception as e:
            logger.error("Failed to get user info", error=str(e))
            raise AuthenticationError("Failed to get user information") from e

    async def validate_token(self, access_token: str) -> dict[str, Any]:
        """Validate access token with OAuth provider."""
        try:
            client = await self.get_client()

            introspect_url = client.server_metadata.get("introspection_endpoint")
            if not introspect_url:
                # Fallback: get user info to validate token
                return await self.get_user_info(access_token)

            response = await client.introspect_token(access_token)

            if not response.get("active", False):
                raise AuthenticationError("Token is not active")

            return response
        except Exception as e:
            logger.error("Failed to validate token", error=str(e))
            raise AuthenticationError("Failed to validate token") from e

    async def close(self) -> None:
        """Close OAuth client."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Global instance
_oauth_handler: OAuthHandler | None = None


def get_oauth_handler() -> OAuthHandler:
    """Get OAuth handler instance."""
    global _oauth_handler
    if _oauth_handler is None:
        _oauth_handler = OAuthHandler()
    return _oauth_handler
