"""Managed Memory API.

This router exposes endpoints to create, read, list, update, and delete
managed memory configurations.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel
from idun_agent_schema.engine.langgraph import CheckpointConfig, SqliteCheckpointConfig, InMemoryCheckpointConfig, PostgresCheckpointConfig
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.manager.managed_memory import (
    ManagedMemoryCreate,
    ManagedMemoryPatch,
    ManagedMemoryRead,
)
from pydantic import TypeAdapter

router = APIRouter()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_memory(id: str, session: AsyncSession) -> ManagedMemoryModel:
    """Get memory config by ID."""
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
    return model


def _model_to_schema(model: ManagedMemoryModel) -> ManagedMemoryRead:
    """Transform database model to response schema."""
    # We need to use TypeAdapter for validating the Union type correctly
    checkpoint_adapter = TypeAdapter(CheckpointConfig)
    memory_config = checkpoint_adapter.validate_python(model.memory_config)

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
    request: ManagedMemoryCreate,
    session: AsyncSession = Depends(get_session),
) -> ManagedMemoryRead:
    """Create a new managed memory configuration."""
    now = datetime.now(UTC)

    # CheckpointConfig is already validated by Pydantic in the request model

    model = ManagedMemoryModel(
        id=uuid4(),
        name=request.name,
        agent_framework=request.agent_framework.value,
        memory_config=request.memory.model_dump(),
        created_at=now,
        updated_at=now,
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
    session: AsyncSession = Depends(get_session),
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

    stmt = select(ManagedMemoryModel).limit(limit).offset(offset)
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedMemoryRead,
    summary="Get managed memory config by ID",
)
async def get_memory(
    id: str,
    session: AsyncSession = Depends(get_session),
) -> ManagedMemoryRead:
    """Get a managed memory configuration by ID."""
    model = await _get_memory(id, session)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed memory config",
)
async def delete_memory(
    id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a managed memory configuration permanently."""
    model = await _get_memory(id, session)
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
) -> ManagedMemoryRead:
    """Update a memory configuration."""
    model = await _get_memory(id, session)

    model.name = request.name
    model.agent_framework = request.agent_framework.value
    # Config is already validated in request model
    model.memory_config = request.memory.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
