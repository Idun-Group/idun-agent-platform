"""Managed MCP Server API.

This router exposes endpoints to create, read, list, update, and delete
managed MCP server configurations.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_session
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel
from idun_agent_schema.engine.mcp_server import MCPServer
from idun_agent_schema.manager.managed_mcp_server import (
    ManagedMCPServerCreate,
    ManagedMCPServerPatch,
    ManagedMCPServerRead,
)

router = APIRouter()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_mcp_server(id: str, session: AsyncSession) -> ManagedMCPServerModel:
    """Get MCP server config by ID."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedMCPServerModel, uuid_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MCP server with id '{id}' not found",
        )
    return model


def _model_to_schema(model: ManagedMCPServerModel) -> ManagedMCPServerRead:
    """Transform database model to response schema."""
    mcp_server = MCPServer(**model.mcp_server_config)
    return ManagedMCPServerRead(
        id=model.id,
        name=model.name,
        mcp_server=mcp_server,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.post(
    "/",
    response_model=ManagedMCPServerRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create managed MCP server",
)
async def create_mcp_server(
    request: ManagedMCPServerCreate,
    session: AsyncSession = Depends(get_session),
) -> ManagedMCPServerRead:
    """Create a new managed MCP server configuration."""
    now = datetime.now(UTC)

    # Validate config
    mcp_server_config = MCPServer(**request.mcp_server.model_dump())

    model = ManagedMCPServerModel(
        id=uuid4(),
        name=request.name,
        mcp_server_config=mcp_server_config.model_dump(),
        created_at=now,
        updated_at=now,
    )

    session.add(model)
    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)


@router.get(
    "/",
    response_model=list[ManagedMCPServerRead],
    summary="List managed MCP servers",
)
async def list_mcp_servers(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
) -> list[ManagedMCPServerRead]:
    """List managed MCP server configurations with pagination."""
    if not (1 <= limit <= PAGINATION_MAX_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 1 and {PAGINATION_MAX_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Offset must be >= 0"
        )

    stmt = select(ManagedMCPServerModel).limit(limit).offset(offset)
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedMCPServerRead,
    summary="Get managed MCP server by ID",
)
async def get_mcp_server(
    id: str,
    session: AsyncSession = Depends(get_session),
) -> ManagedMCPServerRead:
    """Get a managed MCP server configuration by ID."""
    model = await _get_mcp_server(id, session)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed MCP server",
)
async def delete_mcp_server(
    id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a managed MCP server configuration permanently."""
    model = await _get_mcp_server(id, session)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedMCPServerRead,
    summary="Update managed MCP server",
)
async def patch_mcp_server(
    id: str,
    request: ManagedMCPServerPatch,
    session: AsyncSession = Depends(get_session),
) -> ManagedMCPServerRead:
    """Update an MCP server configuration."""
    model = await _get_mcp_server(id, session)

    model.name = request.name
    mcp_server_config = MCPServer(**request.mcp_server.model_dump())
    model.mcp_server_config = mcp_server_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(model)

    return _model_to_schema(model)
