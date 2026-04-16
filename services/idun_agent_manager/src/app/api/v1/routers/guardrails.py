"""Managed Guardrail API.

This router exposes endpoints to create, read, list, update, and delete
managed guardrail configurations. All endpoints are scoped to the
authenticated user's active workspace.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.manager.guardrail_configs import (
    ManagerGuardrailConfig as GuardrailConfig,
)
from idun_agent_schema.manager.managed_guardrail import (
    ManagedGuardrailCreate,
    ManagedGuardrailPatch,
    ManagedGuardrailRead,
)
from idun_agent_schema.manager.project import ProjectRole
from pydantic import TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    ProjectAccess,
    get_current_user,
    get_session,
    require_project_role,
)
from app.infrastructure.db.models.agent_guardrail import AgentGuardrailModel
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel
from app.services.engine_config import recompute_engine_config

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_guardrail(
    id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
    project_id: UUID | None = None,
) -> ManagedGuardrailModel:
    """Get guardrail config by ID, optionally scoped to a workspace."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedGuardrailModel, uuid_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guardrail config with id '{id}' not found",
        )
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guardrail config with id '{id}' not found",
        )
    if project_id is not None and model.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guardrail config with id '{id}' not found",
        )
    return model


def _model_to_schema(
    model: ManagedGuardrailModel, agent_count: int = 0
) -> ManagedGuardrailRead:
    """Transform database model to response schema."""
    guardrail = TypeAdapter(GuardrailConfig).validate_python(model.guardrail_config)
    return ManagedGuardrailRead(
        id=model.id,  # type: ignore
        project_id=model.project_id,  # type: ignore
        name=model.name,
        guardrail=guardrail,
        agent_count=agent_count,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedGuardrailRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed guardrail config",
)
async def create_guardrail(
    request: ManagedGuardrailCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(
        require_project_role(ProjectRole.CONTRIBUTOR)
    ),
) -> ManagedGuardrailRead:
    """Create a new managed guardrail configuration."""
    now = datetime.now(UTC)

    guardrail_config = request.guardrail

    model = ManagedGuardrailModel(
        id=uuid4(),
        name=request.name,
        guardrail_config=guardrail_config.model_dump(),
        created_at=now,
        updated_at=now,
        workspace_id=project_access.workspace_id,
        project_id=project_access.project_id,
    )

    session.add(model)
    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.get(
    "/",
    response_model=list[ManagedGuardrailRead],
    summary="List managed guardrail configs",
)
async def list_guardrails(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_role(ProjectRole.READER)),
) -> list[ManagedGuardrailRead]:
    """List managed guardrail configurations with pagination."""
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
        select(ManagedGuardrailModel)
        .where(
            ManagedGuardrailModel.workspace_id == project_access.workspace_id,
            ManagedGuardrailModel.project_id == project_access.project_id,
        )
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    # Batch count agents per guardrail
    counts: dict[UUID, int] = {}
    if rows:
        count_stmt = (
            select(
                AgentGuardrailModel.guardrail_id,
                func.count(func.distinct(AgentGuardrailModel.agent_id)),
            )
            .where(AgentGuardrailModel.guardrail_id.in_([r.id for r in rows]))
            .group_by(AgentGuardrailModel.guardrail_id)
        )
        counts = dict((await session.execute(count_stmt)).all())

    return [_model_to_schema(r, counts.get(r.id, 0)) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedGuardrailRead,
    summary="Get managed guardrail config by ID",
)
async def get_guardrail(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_role(ProjectRole.READER)),
) -> ManagedGuardrailRead:
    """Get a managed guardrail configuration by ID."""
    model = await _get_guardrail(
        id,
        session,
        project_access.workspace_id,
        project_access.project_id,
    )
    count_stmt = select(func.count(func.distinct(AgentGuardrailModel.agent_id))).where(
        AgentGuardrailModel.guardrail_id == model.id
    )
    agent_count = await session.scalar(count_stmt) or 0
    return _model_to_schema(model, agent_count)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed guardrail config",
)
async def delete_guardrail(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(require_project_role(ProjectRole.ADMIN)),
) -> None:
    """Delete a managed guardrail configuration permanently."""
    model = await _get_guardrail(
        id,
        session,
        project_access.workspace_id,
        project_access.project_id,
    )

    # RESTRICT: check if any agent references this guardrail
    stmt = select(AgentGuardrailModel.agent_id).where(
        AgentGuardrailModel.guardrail_id == model.id
    )
    result = await session.execute(stmt)
    if result.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete guardrail: it is referenced by one or more agents",
        )

    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedGuardrailRead,
    summary="Update managed guardrail config",
)
async def patch_guardrail(
    id: str,
    request: ManagedGuardrailPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    project_access: ProjectAccess = Depends(
        require_project_role(ProjectRole.CONTRIBUTOR)
    ),
) -> ManagedGuardrailRead:
    """Update a guardrail configuration."""
    model = await _get_guardrail(
        id,
        session,
        project_access.workspace_id,
        project_access.project_id,
    )

    model.name = request.name
    guardrail_config = request.guardrail
    model.guardrail_config = guardrail_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()

    # Cascade recompute: update all agents referencing this guardrail
    stmt = select(AgentGuardrailModel.agent_id).where(
        AgentGuardrailModel.guardrail_id == model.id
    )
    result = await session.execute(stmt)
    for (agent_id,) in result.all():
        await recompute_engine_config(session, agent_id)

    await session.refresh(model)
    return _model_to_schema(model)
