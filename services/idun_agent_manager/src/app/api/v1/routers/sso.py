"""Managed SSO configuration API.

This router exposes endpoints to create, read, list, update, and delete
managed SSO configurations. All endpoints are scoped to the
authenticated user's active workspace.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.sso import SSOConfig
from idun_agent_schema.manager.managed_sso import (
    ManagedSSOCreate,
    ManagedSSOPatch,
    ManagedSSORead,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_sso import ManagedSSOModel
from app.services.engine_config import recompute_engine_config

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_sso(
    id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
) -> ManagedSSOModel:
    """Get SSO config by ID, optionally scoped to a workspace."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedSSOModel, uuid_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SSO config with id '{id}' not found",
        )
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SSO config with id '{id}' not found",
        )
    return model


def _model_to_schema(
    model: ManagedSSOModel, agent_count: int = 0
) -> ManagedSSORead:
    """Transform database model to response schema."""
    sso = SSOConfig(**model.sso_config)
    return ManagedSSORead(
        id=model.id,
        name=model.name,
        sso=sso,
        agent_count=agent_count,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedSSORead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed SSO config",
)
async def create_sso(
    request: ManagedSSOCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedSSORead:
    """Create a new managed SSO configuration."""
    now = datetime.now(UTC)

    sso_config = SSOConfig(**request.sso.model_dump())

    model = ManagedSSOModel(
        id=uuid4(),
        name=request.name,
        sso_config=sso_config.model_dump(),
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
    response_model=list[ManagedSSORead],
    summary="List managed SSO configs",
)
async def list_ssos(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedSSORead]:
    """List managed SSO configurations with pagination."""
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
        select(ManagedSSOModel)
        .where(ManagedSSOModel.workspace_id == workspace_id)
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    # Batch count agents per SSO config
    counts: dict[UUID, int] = {}
    if rows:
        count_stmt = (
            select(
                ManagedAgentModel.sso_id,
                func.count(ManagedAgentModel.id),
            )
            .where(ManagedAgentModel.sso_id.in_([r.id for r in rows]))
            .group_by(ManagedAgentModel.sso_id)
        )
        counts = dict(await session.execute(count_stmt))

    return [_model_to_schema(r, counts.get(r.id, 0)) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedSSORead,
    summary="Get managed SSO config by ID",
)
async def get_sso(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedSSORead:
    """Get a managed SSO configuration by ID."""
    model = await _get_sso(id, session, workspace_id)
    count_stmt = select(func.count(ManagedAgentModel.id)).where(
        ManagedAgentModel.sso_id == model.id
    )
    agent_count = await session.scalar(count_stmt) or 0
    return _model_to_schema(model, agent_count)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed SSO config",
)
async def delete_sso(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed SSO configuration permanently."""
    model = await _get_sso(id, session, workspace_id)

    stmt = select(ManagedAgentModel.id).where(ManagedAgentModel.sso_id == model.id)
    result = await session.execute(stmt)
    if result.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete SSO config: it is referenced by one or more agents",
        )

    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedSSORead,
    summary="Update managed SSO config",
)
async def patch_sso(
    id: str,
    request: ManagedSSOPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedSSORead:
    """Update an SSO configuration."""
    model = await _get_sso(id, session, workspace_id)

    model.name = request.name
    sso_config = SSOConfig(**request.sso.model_dump())
    model.sso_config = sso_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()

    stmt = select(ManagedAgentModel.id).where(ManagedAgentModel.sso_id == model.id)
    result = await session.execute(stmt)
    for (agent_id,) in result.all():
        await recompute_engine_config(session, agent_id)

    await session.refresh(model)
    return _model_to_schema(model)
