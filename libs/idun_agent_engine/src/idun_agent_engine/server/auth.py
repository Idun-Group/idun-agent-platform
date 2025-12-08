"""Authentication dependencies for Idun Agent Engine."""

import logging
from typing import Annotated, Any

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from idun_agent_schema.engine import SSOConfiguration

logger = logging.getLogger(__name__)

# use auto_error=False so we can handle the "SSO not configured" case gracefully
# inside verify_sso without 403-ing immediately if header is missing (when SSO is off).
security = HTTPBearer(auto_error=False)

# Cache for OIDC config and JWKS
_oidc_config_cache: dict[str, Any] = {}
_jwks_cache: dict[str, Any] = {}


async def get_oidc_config(issuer: str) -> dict[str, Any]:
    """Fetch and cache OIDC configuration."""
    if issuer in _oidc_config_cache:
        return _oidc_config_cache[issuer]

    url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=10.0)
            resp.raise_for_status()
            config = resp.json()
            _oidc_config_cache[issuer] = config
            return config
        except Exception as e:
            logger.error(f"Failed to fetch OIDC config from {url}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch OIDC configuration",
            )


async def get_jwks(jwks_uri: str) -> dict[str, Any]:
    """Fetch and cache JWKS."""
    if jwks_uri in _jwks_cache:
        return _jwks_cache[jwks_uri]

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(jwks_uri, timeout=10.0)
            resp.raise_for_status()
            keys = resp.json()
            _jwks_cache[jwks_uri] = keys
            return keys
        except Exception as e:
            logger.error(f"Failed to fetch JWKS from {jwks_uri}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch JWKS",
            )


async def verify_sso(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict[str, Any] | None:
    """Verifies the JWT token if SSO is configured.

    Returns:
        dict: The decoded token payload if SSO is configured and token is valid.
        None: If SSO is NOT configured.

    Raises:
        HTTPException: If SSO is configured but token is missing or invalid.
    """
    # Check if SSO is configured
    config: SSOConfiguration | None = None
    if (
        hasattr(request.app.state, "engine_config")
        and request.app.state.engine_config.sso
    ):
        config = request.app.state.engine_config.sso

    if not config:
        return None

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = creds.credentials

    try:
        # Get OIDC config and JWKS
        oidc_config = await get_oidc_config(config.issuer)
        jwks_uri = oidc_config.get("jwks_uri")
        if not jwks_uri:
            logger.error("jwks_uri not found in OIDC config")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Configuration error: jwks_uri not found",
            )

        jwks = await get_jwks(jwks_uri)

        # Determine audience and algorithms
        # If expected_audiences is empty, we default to client_id for verification
        # or we might need to be careful.
        # python-jose requires audience if 'aud' claim is present and verify_aud is True.
        # Ensure audience is a string or None, as python-jose's decode expects.
        # We take the first audience if multiple are configured, assuming we want to match one.
        # Ideally python-jose should support a list of allowed audiences, but for verify_aud=True
        # and a single 'aud' in the token, passing the matching audience as string works.
        audience_param: str | None = None

        audiences = config.expected_audiences or [config.client_id]
        if audiences:
            # For now, just take the first one. If you have multiple valid audiences,
            # this logic might need to be smarter (e.g. check which one matches the token's aud).
            # But python-jose's audience param is "audience to check for".
            if isinstance(audiences, list):
                audience_param = audiences[0]
            else:
                audience_param = audiences

        # Verify token
        payload = jwt.decode(
            token,
            jwks,
            algorithms=config.allowed_algs,
            audience=audience_param,
            issuer=config.issuer,
            options={
                "verify_at_hash": False,
                # We enable aud verification since we pass audience
                "verify_aud": True,
            },
        )

        return payload

    except JWTError as e:
        logger.warning(f"JWT validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )
