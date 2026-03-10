"""Managed Memory API.

This router exposes endpoints to create, read, list, update, and delete
managed memory configurations. All endpoints are scoped to the
authenticated user's active workspace.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.manager.managed_memory import (
    ManagedMemoryCreate,
    ManagedMemoryPatch,
    ManagedMemoryRead,
    MemoryConfig,
)
from pydantic import TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.managed_agent import ManagedAgentModel
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
from app.services.engine_config import recompute_engine_config

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_memory(
    id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
) -> ManagedMemoryModel:
    """Get memory config by ID, optionally scoped to a workspace."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedMemoryModel, uuid_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory config with id '{id}' not found",
        )
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory config with id '{id}' not found",
        )
    return model


def _model_to_schema(
    model: ManagedMemoryModel, agent_count: int = 0
) -> ManagedMemoryRead:
    """Transform database model to response schema."""
    config_adapter = TypeAdapter(MemoryConfig)
    memory_config = config_adapter.validate_python(model.memory_config)

    return ManagedMemoryRead(
        id=model.id,  # type: ignore
        name=model.name,
        agent_framework=AgentFramework(model.agent_framework),
        memory=memory_config,
        agent_count=agent_count,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedMemoryRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed memory config",
)
async def create_memory(
    request: ManagedMemoryCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMemoryRead:
    """Create a new managed memory configuration."""
    now = datetime.now(UTC)

    model = ManagedMemoryModel(
        id=uuid4(),
        name=request.name,
        agent_framework=request.agent_framework.value,
        memory_config=request.memory.model_dump(),
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
    response_model=list[ManagedMemoryRead],
    summary="List managed memory configs",
)
async def list_memories(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    agent_framework: AgentFramework | None = None,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedMemoryRead]:
    """List managed memory configurations with pagination."""
    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0"
        )

    stmt = select(ManagedMemoryModel).where(
        ManagedMemoryModel.workspace_id == workspace_id
    )
    if agent_framework:
        stmt = stmt.where(ManagedMemoryModel.agent_framework == agent_framework.value)
    stmt = stmt.limit(limit).offset(offset)

    result = await session.execute(stmt)
    rows = result.scalars().all()

    # Batch count agents per memory config
    counts: dict[UUID, int] = {}
    if rows:
        count_stmt = (
            select(
                ManagedAgentModel.memory_id,
                func.count(ManagedAgentModel.id),
            )
            .where(ManagedAgentModel.memory_id.in_([r.id for r in rows]))
            .group_by(ManagedAgentModel.memory_id)
        )
        counts = dict((await session.execute(count_stmt)).all())

    return [_model_to_schema(r, counts.get(r.id, 0)) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedMemoryRead,
    summary="Get managed memory config by ID",
)
async def get_memory(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMemoryRead:
    """Get a managed memory configuration by ID."""
    model = await _get_memory(id, session, workspace_id)
    count_stmt = select(func.count(ManagedAgentModel.id)).where(
        ManagedAgentModel.memory_id == model.id
    )
    agent_count = await session.scalar(count_stmt) or 0
    return _model_to_schema(model, agent_count)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed memory config",
)
async def delete_memory(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed memory configuration permanently."""
    model = await _get_memory(id, session, workspace_id)

    stmt = select(ManagedAgentModel.id).where(
        ManagedAgentModel.memory_id == model.id
    )
    result = await session.execute(stmt)
    if result.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete memory config: it is referenced by one or more agents",
        )

    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedMemoryRead,
    summary="Update managed memory config",
)
async def patch_memory(
    id: str,
    request: ManagedMemoryPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMemoryRead:
    """Update a memory configuration."""
    model = await _get_memory(id, session, workspace_id)

    model.name = request.name
    model.agent_framework = request.agent_framework.value
    model.memory_config = request.memory.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()

    # Cascade recompute: update all agents referencing this memory config
    stmt = select(ManagedAgentModel.id).where(
        ManagedAgentModel.memory_id == model.id
    )
    result = await session.execute(stmt)
    for (agent_id,) in result.all():
        await recompute_engine_config(session, agent_id)

    await session.refresh(model)
    return _model_to_schema(model)
