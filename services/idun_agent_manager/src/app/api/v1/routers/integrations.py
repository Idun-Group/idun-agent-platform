"""Managed Integration configuration API.

This router exposes endpoints to create, read, list, update, and delete
managed integration configurations. All endpoints are scoped to the
authenticated user's active workspace.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.manager.managed_integration import (
    ManagedIntegrationCreate,
    ManagedIntegrationPatch,
    ManagedIntegrationRead,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.managed_integration import (
    ManagedIntegrationModel,
)

router = APIRouter()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_integration(
    id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
) -> ManagedIntegrationModel:
    """Get integration config by ID, optionally scoped to a workspace."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedIntegrationModel, uuid_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration with id '{id}' not found",
        )
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration with id '{id}' not found",
        )
    return model


def _model_to_schema(
    model: ManagedIntegrationModel,
) -> ManagedIntegrationRead:
    """Transform database model to response schema."""
    integration = IntegrationConfig(**model.integration_config)
    return ManagedIntegrationRead(
        id=model.id,
        name=model.name,
        integration=integration,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedIntegrationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed integration",
)
async def create_integration(
    request: ManagedIntegrationCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedIntegrationRead:
    """Create a new managed integration configuration."""
    now = datetime.now(UTC)

    integration_config = IntegrationConfig(**request.integration.model_dump())

    model = ManagedIntegrationModel(
        id=uuid4(),
        name=request.name,
        integration_config=integration_config.model_dump(),
        created_at=now,
        updated_at=now,
        workspace_id=workspace_id,
    )

    session.add(model)
    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.get(
    "/",
    response_model=list[ManagedIntegrationRead],
    summary="List managed integrations",
)
async def list_integrations(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedIntegrationRead]:
    """List managed integration configurations with pagination."""
    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be >= 0",
        )

    stmt = (
        select(ManagedIntegrationModel)
        .where(ManagedIntegrationModel.workspace_id == workspace_id)
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedIntegrationRead,
    summary="Get managed integration by ID",
)
async def get_integration(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedIntegrationRead:
    """Get a managed integration configuration by ID."""
    model = await _get_integration(id, session, workspace_id)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed integration",
)
async def delete_integration(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed integration configuration permanently."""
    model = await _get_integration(id, session, workspace_id)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedIntegrationRead,
    summary="Update managed integration",
)
async def patch_integration(
    id: str,
    request: ManagedIntegrationPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedIntegrationRead:
    """Update an integration configuration."""
    model = await _get_integration(id, session, workspace_id)

    model.name = request.name
    integration_config = IntegrationConfig(
        **request.integration.model_dump()
    )
    model.integration_config = integration_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
