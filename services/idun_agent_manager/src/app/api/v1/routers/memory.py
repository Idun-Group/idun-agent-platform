"""Managed Memory API.

This router exposes endpoints to create, read, list, update, and delete
managed memory configurations. All CRUD endpoints are project-scoped
with RBAC enforcement.

Endpoints (mounted at /projects/{project_id}/memory):
    POST   /          - Create a new memory config          (contributor)
    GET    /          - List memory configs (pagination)     (reader)
    GET    /{id}      - Get a specific memory config by ID   (reader)
    PATCH  /{id}      - Update a memory config               (contributor)
    DELETE /{id}      - Delete a memory config               (admin)
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_project_role,
    require_workspace,
)
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_memory(
    id: str,
    session: AsyncSession,
    workspace_id: UUID,
    project_id: UUID,
) -> ManagedMemoryModel:
    """Get memory config by ID, scoped to workspace and project."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedMemoryModel, uuid_id)
    if not model or model.workspace_id != workspace_id or model.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory config with id '{id}' not found",
        )
    return model


def _model_to_schema(model: ManagedMemoryModel) -> ManagedMemoryRead:
    """Transform database model to response schema."""
    config_adapter = TypeAdapter(MemoryConfig)
    memory_config = config_adapter.validate_python(model.memory_config)

    return ManagedMemoryRead(
        id=model.id,  # type: ignore
        name=model.name,
        agent_framework=AgentFramework(model.agent_framework),
        memory=memory_config,
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
    project_id: str,
    request: ManagedMemoryCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMemoryRead:
    """Create a new managed memory configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")

    now = datetime.now(UTC)

    model = ManagedMemoryModel(
        id=uuid4(),
        name=request.name,
        agent_framework=request.agent_framework.value,
        memory_config=request.memory.model_dump(),
        created_at=now,
        updated_at=now,
        workspace_id=access.workspace_id,
        project_id=project_uuid,
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
    project_id: str,
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    agent_framework: AgentFramework | None = None,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedMemoryRead]:
    """List managed memory configurations with pagination."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")

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
        ManagedMemoryModel.workspace_id == access.workspace_id,
        ManagedMemoryModel.project_id == project_uuid,
    )
    if agent_framework:
        stmt = stmt.where(ManagedMemoryModel.agent_framework == agent_framework.value)
    stmt = stmt.limit(limit).offset(offset)

    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedMemoryRead,
    summary="Get managed memory config by ID",
)
async def get_memory(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMemoryRead:
    """Get a managed memory configuration by ID."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")
    model = await _get_memory(id, session, access.workspace_id, project_uuid)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed memory config",
)
async def delete_memory(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed memory configuration permanently."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "admin")
    model = await _get_memory(id, session, access.workspace_id, project_uuid)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedMemoryRead,
    summary="Update managed memory config",
)
async def patch_memory(
    project_id: str,
    id: str,
    request: ManagedMemoryPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMemoryRead:
    """Update a memory configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")
    model = await _get_memory(id, session, access.workspace_id, project_uuid)

    model.name = request.name
    model.agent_framework = request.agent_framework.value
    model.memory_config = request.memory.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
