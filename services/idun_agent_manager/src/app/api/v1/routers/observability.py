"""Managed Observability API.

This router exposes endpoints to create, read, list, update, and delete
managed observability configurations. All endpoints are scoped to the
authenticated user's active workspace.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from idun_agent_schema.manager.managed_observability import (
    ManagedObservabilityCreate,
    ManagedObservabilityPatch,
    ManagedObservabilityRead,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.managed_observability import ManagedObservabilityModel

router = APIRouter()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_observability(
    id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
) -> ManagedObservabilityModel:
    """Get observability config by ID, optionally scoped to a workspace."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedObservabilityModel, uuid_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Observability config with id '{id}' not found",
        )
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Observability config with id '{id}' not found",
        )
    return model


def _model_to_schema(model: ManagedObservabilityModel) -> ManagedObservabilityRead:
    """Transform database model to response schema."""
    observability = ObservabilityConfig(**model.observability_config)
    return ManagedObservabilityRead(
        id=model.id,  # type: ignore
        name=model.name,
        observability=observability,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedObservabilityRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed observability config",
)
async def create_observability(
    request: ManagedObservabilityCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedObservabilityRead:
    """Create a new managed observability configuration."""
    now = datetime.now(UTC)

    observability_config = ObservabilityConfig(**request.observability.model_dump())

    model = ManagedObservabilityModel(
        id=uuid4(),
        name=request.name,
        observability_config=observability_config.model_dump(),
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
    response_model=list[ManagedObservabilityRead],
    summary="List managed observability configs",
)
async def list_observabilities(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedObservabilityRead]:
    """List managed observability configurations with pagination."""
    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0"
        )

    stmt = (
        select(ManagedObservabilityModel)
        .where(ManagedObservabilityModel.workspace_id == workspace_id)
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedObservabilityRead,
    summary="Get managed observability config by ID",
)
async def get_observability(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedObservabilityRead:
    """Get a managed observability configuration by ID."""
    model = await _get_observability(id, session, workspace_id)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed observability config",
)
async def delete_observability(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed observability configuration permanently."""
    model = await _get_observability(id, session, workspace_id)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedObservabilityRead,
    summary="Update managed observability config",
)
async def patch_observability(
    id: str,
    request: ManagedObservabilityPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedObservabilityRead:
    """Update an observability configuration."""
    model = await _get_observability(id, session, workspace_id)

    model.name = request.name
    observability_config = ObservabilityConfig(**request.observability.model_dump())
    model.observability_config = observability_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
