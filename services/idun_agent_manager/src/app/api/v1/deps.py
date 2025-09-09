"""FastAPI dependencies for dependency injection."""

from typing import Annotated, AsyncGenerator, List
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.application.services.agent_service import AgentService
from app.core.settings import Settings, get_settings_dependency
from app.infrastructure.db.session import get_async_session

# Authentication and authorization dependencies
class Principal(BaseModel):
    """Authenticated caller identity and authorization context."""
    user_id: str
    tenant_id: UUID
    roles: List[str] = []
    workspace_ids: List[UUID] = []


async def get_principal(request: Request) -> Principal:
    """Resolve the authenticated principal from the request.

    Order of resolution:
    - Authorization: Bearer <JWT> (claims: sub, tenant_id, roles, workspace_ids)
    - Dev fallbacks via headers: X-Tenant-ID, X-Workspace-IDs (comma-separated), X-Roles
    """
    auth_header = request.headers.get("Authorization")
    tenant_header = request.headers.get("X-Tenant-ID")
    workspaces_header = request.headers.get("X-Workspace-IDs")
    roles_header = request.headers.get("X-Roles")

    user_id: str | None = None
    tenant_id: UUID | None = None
    roles: List[str] = []
    workspace_ids: List[UUID] = []

    # Try JWT first
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):].strip()
        try:
            from app.infrastructure.auth.jwt_handler import get_jwt_handler
            payload = get_jwt_handler().verify_token(token, token_type="access")
            user_id = str(payload.get("sub")) if payload.get("sub") else None
            if payload.get("tenant_id"):
                try:
                    tenant_id = UUID(str(payload["tenant_id"]))
                except ValueError:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid tenant_id claim")
            # Optional claims
            roles = list(payload.get("roles", []) or [])
            ws_claims = payload.get("workspace_ids", []) or []
            for ws in ws_claims:
                try:
                    workspace_ids.append(UUID(str(ws)))
                except ValueError:
                    # Skip invalid workspace UUIDs in claims
                    continue
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
    else:
        # No JWT: require at least dev headers
        user_id = request.headers.get("X-User-ID") or "dev-user"

    # Fallbacks/overrides from headers (useful in dev/testing)
    if tenant_id is None and tenant_header:
        try:
            tenant_id = UUID(tenant_header)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Tenant-ID format")

    if workspaces_header:
        try:
            workspace_ids = [UUID(x.strip()) for x in workspaces_header.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Workspace-IDs format")

    if roles_header:
        roles = [r.strip() for r in roles_header.split(",") if r.strip()]

    if not tenant_id:
        # As a last resort, try existing helper
        tenant_id = await get_current_tenant_id(request)

    if not user_id or not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    return Principal(user_id=user_id, tenant_id=tenant_id, roles=roles, workspace_ids=workspace_ids)


# Database session dependency
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session."""
    async for session in get_async_session():
        yield session


# Settings dependency
def get_settings() -> Settings:
    """Get application settings."""
    return get_settings_dependency()


# Repository dependencies
def get_agent_repository(
    session: Annotated[AsyncSession, Depends(get_session)]
):
    """Get agent repository."""
    from app.infrastructure.db.repositories.agents import SqlAlchemyAgentRepository

    return SqlAlchemyAgentRepository(session)


def get_agent_run_repository(
    session: Annotated[AsyncSession, Depends(get_session)]
):
    """Get agent run repository."""
    from app.infrastructure.db.repositories.agents import SqlAlchemyAgentRunRepository

    return SqlAlchemyAgentRunRepository(session)


# Infrastructure service dependencies
def get_engine_service():
    """Get Idun Engine service."""
    from app.infrastructure.http.engine_client import IdunEngineService

    return IdunEngineService()





# Service dependencies
def get_agent_service(
    agent_repo = Depends(get_agent_repository),
    run_repo = Depends(get_agent_run_repository),
    engine_service = Depends(get_engine_service),
) -> AgentService:
    """Get agent service."""
    return AgentService(agent_repo, run_repo, engine_service)


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
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tenant ID format"
            )
    
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
            detail="Limit must be between 1 and 1000"
        )
    
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be non-negative"
        )
    
    return limit, offset 