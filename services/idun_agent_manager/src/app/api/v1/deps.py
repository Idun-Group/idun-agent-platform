"""FastAPI dependencies for dependency injection."""

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from idun_agent_schema.manager.deps import Principal
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.agent_service import AgentService
from app.core.settings import Settings, get_settings_dependency
from app.infrastructure.db.session import get_async_session, get_async_engine
from sqlalchemy import text


async def get_principal(request: Request) -> Principal:
    """Resolve the authenticated principal from the request.

    Order of resolution:
    - Authorization: Bearer <JWT> (claims: sub, tenant_id, roles, workspace_ids)
    - Dev fallbacks via headers: X-Tenant-ID, X-Workspace-IDs (comma-separated), X-Roles
    """
    auth_header = request.headers.get("Authorization")
    sid = request.cookies.get("sid")
    # Require authentication: either Bearer token or sid session
    if not auth_header and not sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # If sid is present, resolve session tokens and prefer id_token for verification
    if not auth_header and sid:
        import json
        import time

        from app.infrastructure.auth.oidc import get_provider
        from app.infrastructure.cache.redis_client import get_redis_client

        redis = get_redis_client()
        raw = await redis.get(f"sid:{sid}")
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
            )
        data = json.loads(raw)
        # ensure this name exists even if we don't verify again
        verified_claims = None
        access_token = data.get("access_token")
        refresh_token = data.get("refresh_token")
        expires_at = int(data.get("expires_at") or 0)
        print(f"access_token: {access_token}")
        print(f"refresh_token: {refresh_token}")
        print(f"expires_at: {expires_at}")
        # Refresh if expiring within 2 minutes
        if time.time() > (expires_at - 120) and refresh_token:
            provider = get_provider()
            try:
                import httpx

                meta = await provider._discover()
                token_endpoint = meta.get("token_endpoint")
                async with httpx.AsyncClient(timeout=15) as client:
                    if not token_endpoint or not isinstance(token_endpoint, str):
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid OIDC token endpoint",
                        )
                    resp = await client.post(
                        token_endpoint,
                        data={
                            "grant_type": "refresh_token",
                            "refresh_token": refresh_token,
                            "client_id": get_settings_dependency().auth.client_id,
                            "client_secret": get_settings_dependency().auth.client_secret,
                        },
                        headers={"Content-Type": "application/x-www-form-urlencoded"},
                    )
                    resp.raise_for_status()
                    tok = resp.json()
                    access_token = tok.get("access_token") or access_token
                    new_refresh = tok.get("refresh_token")
                    if new_refresh:
                        refresh_token = new_refresh
                    expires_in = int(tok.get("expires_in") or 3600)
                    data.update(
                        {
                            "access_token": access_token,
                            "refresh_token": refresh_token,
                            "expires_at": int(time.time()) + expires_in,
                        }
                    )
                    await redis.set(
                        f"sid:{sid}", json.dumps(data), ex=max(expires_in, 3600)
                    )
            except Exception as err:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session refresh failed",
                ) from err

        # Prefer cached principal in session; otherwise verify id/access token
        normalized = data.get("principal")
        print(f"normalized: {normalized}")
        if not normalized:
            provider = get_provider()
            verified_claims = None
            if data.get("id_token"):
                try:
                    verified_claims = await provider.verify_jwt(data["id_token"])
                except Exception as e:
                    print("Error verifying id_token:", e)
                    verified_claims = None
            if verified_claims is None and data.get("access_token"):
                try:
                    verified_claims = await provider.verify_jwt(data["access_token"])
                except Exception as e:
                    print("Error verifying access_token:", e)
                    verified_claims = None
            if verified_claims is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            normalized = provider.normalize_claims(verified_claims)
        user_id = normalized.get("user_id")
        tenant_id = None
        tenant_claim = normalized.get("tenant_id") or (
            verified_claims.get("tenant_id") if verified_claims else None
        )
        if tenant_claim:
            try:
                tenant_id = UUID(str(tenant_claim))
            except ValueError as err:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid tenant_id claim",
                ) from err
        roles = list(normalized.get("roles", []))
        workspace_ids: list[UUID] = []
        for ws in normalized.get("workspace_ids", []) or []:
            try:
                workspace_ids.append(UUID(str(ws)))
            except ValueError:
                continue

        # Derive tenant via DB if not present: users.email -> tenant_users -> tenant_id
        if tenant_id is None:
            email = normalized.get("email")
            if email:
                try:
                    engine = get_async_engine()
                    async with engine.begin() as conn:
                        res = await conn.execute(
                            text(
                                """
                                SELECT tu.tenant_id
                                FROM tenant_users tu
                                JOIN users u ON u.id = tu.user_id
                                WHERE u.email = :email
                                LIMIT 1
                                """
                            ),
                            {"email": email},
                        )
                        row = res.first()
                        if row:
                            tenant_id = row[0]
                except Exception as e:
                    print("Tenant lookup by email failed:", e)

        # Fallback: allow tenant via header if still not present
        if tenant_id is None:
            tenant_header = request.headers.get("X-Tenant-ID")
            if tenant_header:
                try:
                    tenant_id = UUID(tenant_header)
                except ValueError as err:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid X-Tenant-ID format",
                    ) from err

        if not user_id or not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
            )

        return Principal(
            user_id=user_id, tenant_id=tenant_id, roles=roles, workspace_ids=workspace_ids
        )
    tenant_header = request.headers.get("X-Tenant-ID")
    workspaces_header = request.headers.get("X-Workspace-IDs")
    roles_header = request.headers.get("X-Roles")

    user_id: str | None = None
    tenant_id: UUID | None = None
    roles: list[str] = []
    workspace_ids: list[UUID] = []

    # Try Authorization Bearer JWT path
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer ") :].strip()
        try:
            # Verify via OIDC provider (JWKS) and normalize to principal-like data
            from app.infrastructure.auth.oidc import get_provider

            provider = get_provider()
            claims = await provider.verify_jwt(token)
            normalized = provider.normalize_claims(claims)
            user_id = normalized.get("user_id")
            tenant_claim = normalized.get("tenant_id") or claims.get("tenant_id")
            if tenant_claim:
                try:
                    tenant_id = UUID(str(tenant_claim))
                except ValueError as err:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid tenant_id claim",
                    ) from err
            roles = list(normalized.get("roles", []))
            for ws in normalized.get("workspace_ids", []) or []:
                try:
                    workspace_ids.append(UUID(str(ws)))
                except ValueError:
                    continue
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from err
    else:
        # No JWT and no sid-derived token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fallbacks/overrides from headers (useful in dev/testing)
    if tenant_id is None and tenant_header:
        try:
            tenant_id = UUID(tenant_header)
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Tenant-ID format",
            ) from err

    if workspaces_header:
        try:
            workspace_ids = [
                UUID(x.strip()) for x in workspaces_header.split(",") if x.strip()
            ]
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Workspace-IDs format",
            ) from err

    if roles_header:
        roles = [r.strip() for r in roles_header.split(",") if r.strip()]

    if not user_id or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    return Principal(
        user_id=user_id, tenant_id=tenant_id, roles=roles, workspace_ids=workspace_ids
    )


# Database session dependency
async def get_session() -> AsyncIterator[AsyncSession]:
    """Get database session."""
    async for session in get_async_session():
        yield session


# Settings dependency
def get_settings() -> Settings:
    """Get application settings."""
    return get_settings_dependency()


# Repository dependencies
def get_agent_repository(session: Annotated[AsyncSession, Depends(get_session)]):
    """Get agent repository."""
    from app.infrastructure.db.repositories.agents import SqlAlchemyAgentRepository

    return SqlAlchemyAgentRepository(session)


def get_agent_run_repository(session: Annotated[AsyncSession, Depends(get_session)]):
    """Get agent run repository."""
    from app.infrastructure.db.repositories.agents import SqlAlchemyAgentRunRepository

    return SqlAlchemyAgentRunRepository(session)


# Service dependencies
def get_agent_service(
    agent_repo=Depends(get_agent_repository),
    run_repo=Depends(get_agent_run_repository),
) -> AgentService:
    """Get agent service."""
    return AgentService(agent_repo, run_repo)


async def get_current_user(request: Request) -> str:
    """Get current authenticated user ID.

    This is a placeholder implementation.
    In a real application, you would:
    1. Extract JWT token from Authorization header
    2. Validate token with your auth provider
    3. Return user information
    """
    # For now, return a mock user ID
    # TODO: Implement real authentication
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Mock user ID for development
    return "mock-user-123"


async def get_current_tenant_id(request: Request) -> UUID:
    """Get current tenant ID.

    This extracts tenant information from the request.
    Could be from:
    1. JWT token claims
    2. Request headers
    3. URL parameters
    4. Database lookup based on user
    """
    # For now, return a mock tenant ID
    # TODO: Implement real tenant resolution
    tenant_header = request.headers.get("X-Tenant-ID")
    if tenant_header:
        try:
            return UUID(tenant_header)
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tenant ID format",
            ) from err

    # Mock tenant ID for development
    return UUID("550e8400-e29b-41d4-a716-446655440000")


# Combined dependencies
async def get_current_user_and_tenant(
    user_id: Annotated[str, Depends(get_current_user)],
    tenant_id: Annotated[UUID, Depends(get_current_tenant_id)],
) -> tuple[str, UUID]:
    """Get current user and tenant."""
    return user_id, tenant_id


# Rate limiting dependency (placeholder)
async def rate_limit_dependency(request: Request) -> None:
    """Rate limiting dependency.

    This is a placeholder for rate limiting logic.
    In a real application, you would:
    1. Check request rate against limits
    2. Use Redis or in-memory store for counters
    3. Raise HTTPException if rate exceeded
    """
    # TODO: Implement rate limiting
    pass


# Pagination dependencies
def get_pagination_params(
    limit: int = 100,
    offset: int = 0,
) -> tuple[int, int]:
    """Get pagination parameters with validation."""
    if limit < 1 or limit > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 1000",
        )

    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be non-negative",
        )

    return limit, offset
