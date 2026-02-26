"""OIDC JWT validation for engine route protection."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, Request, status
from idun_agent_schema.engine.sso import SSOConfig

logger = logging.getLogger(__name__)

_JWKS_CACHE_TTL = 3600  # 1 hour


class OIDCValidator:
    """Validates JWTs against an OIDC provider's JWKS.

    Fetches signing keys from ``{issuer}/.well-known/openid-configuration``
    and caches them for ``_JWKS_CACHE_TTL`` seconds.
    """

    def __init__(self, config: SSOConfig) -> None:
        self._issuer = config.issuer.rstrip("/")
        self._client_id = config.client_id
        self._allowed_domains = (
            [d.lower() for d in config.allowed_domains]
            if config.allowed_domains
            else None
        )
        self._allowed_emails = (
            [e.lower() for e in config.allowed_emails]
            if config.allowed_emails
            else None
        )
        self._jwks_client: jwt.PyJWKClient | None = None
        self._jwks_fetched_at: float = 0.0
        self._algorithms: list[str] = ["RS256"]

    async def _ensure_jwks(self) -> jwt.PyJWKClient:
        """Fetch or return cached JWKS client."""
        now = time.monotonic()
        if (
            self._jwks_client is not None
            and (now - self._jwks_fetched_at) < _JWKS_CACHE_TTL
        ):
            return self._jwks_client

        discovery_url = f"{self._issuer}/.well-known/openid-configuration"
        async with httpx.AsyncClient() as client:
            resp = await client.get(discovery_url, timeout=10)
            resp.raise_for_status()
            openid_config = resp.json()

        jwks_uri = openid_config.get("jwks_uri")
        if not jwks_uri:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(f"OIDC discovery at {discovery_url} did not return a jwks_uri"),
            )

        self._jwks_client = jwt.PyJWKClient(jwks_uri)
        self._jwks_fetched_at = now
        logger.info("OIDC JWKS fetched from %s", jwks_uri)
        return self._jwks_client

    async def validate_token(self, token: str) -> dict[str, Any]:
        """Decode and validate a JWT. Returns claims on success."""
        try:
            jwks_client = await self._ensure_jwks()
            signing_key = jwks_client.get_signing_key_from_jwt(token)

            claims: dict[str, Any] = jwt.decode(
                token,
                signing_key.key,
                algorithms=self._algorithms,
                issuer=self._issuer,
                audience=self._client_id,
                options={"require": ["exp", "iss", "aud"]},
            )
        except HTTPException:
            raise
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )
        except jwt.InvalidAudienceError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token audience",
            )
        except jwt.InvalidIssuerError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token issuer",
            )
        except (jwt.PyJWTError, Exception) as exc:
            logger.warning("JWT validation failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or malformed token",
            )

        # Check email restrictions
        email: str | None = claims.get("email", "").lower() or None
        if self._allowed_emails is not None and (
            email is None or email not in self._allowed_emails
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not in allowed list",
            )

        if self._allowed_domains is not None:
            if email is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Token does not contain an email claim",
                )
            domain = email.split("@", 1)[-1]
            if domain not in self._allowed_domains:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Email domain not allowed",
                )

        return claims


async def get_verified_user(request: Request) -> dict[str, Any] | None:
    """FastAPI dependency: validates JWT if SSO is configured.

    Returns ``None`` when SSO is not configured (open access).
    """
    validator: OIDCValidator | None = getattr(request.app.state, "sso_validator", None)
    if validator is None:
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        token = auth_header[7:]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed Token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    return await validator.validate_token(token)
