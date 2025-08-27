"""FastAPI dependencies for dependency injection."""

from typing import Annotated, AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.agent_service import AgentService
from app.core.settings import Settings, get_settings_dependency
from app.infrastructure.db.session import get_async_session



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


# Authentication and authorization dependencies
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