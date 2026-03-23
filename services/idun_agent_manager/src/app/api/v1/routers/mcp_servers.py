"""Managed MCP Server API.

This router exposes endpoints to create, read, list, update, and delete
managed MCP server configurations. All endpoints are scoped to the
authenticated user's active workspace.
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from idun_agent_schema.engine.mcp_server import MCPServer
from idun_agent_schema.manager.managed_mcp_server import (
    ManagedMCPServerCreate,
    ManagedMCPServerPatch,
    ManagedMCPServerRead,
    MCPToolSchema,
    MCPToolsResponse,
)
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.websocket import websocket_client
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_workspace,
)
from app.infrastructure.db.models.agent_mcp_server import AgentMCPServerModel
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel
from app.services.engine_config import recompute_engine_config

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100
DISCOVER_TOOLS_TIMEOUT_SECONDS = 15


async def _get_mcp_server(
    id: str,
    session: AsyncSession,
    workspace_id: UUID | None = None,
) -> ManagedMCPServerModel:
    """Get MCP server config by ID, optionally scoped to a workspace."""
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
    if workspace_id is not None and model.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MCP server with id '{id}' not found",
        )
    return model


def _model_to_schema(
    model: ManagedMCPServerModel, agent_count: int = 0
) -> ManagedMCPServerRead:
    """Transform database model to response schema."""
    mcp_server = MCPServer(**model.mcp_server_config)
    return ManagedMCPServerRead(
        id=model.id,
        name=model.name,
        mcp_server=mcp_server,
        agent_count=agent_count,
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
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMCPServerRead:
    """Create a new managed MCP server configuration."""
    now = datetime.now(UTC)

    mcp_server_config = MCPServer(**request.mcp_server.model_dump())

    model = ManagedMCPServerModel(
        id=uuid4(),
        name=request.name,
        mcp_server_config=mcp_server_config.model_dump(),
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
    response_model=list[ManagedMCPServerRead],
    summary="List managed MCP servers",
)
async def list_mcp_servers(
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
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

    stmt = (
        select(ManagedMCPServerModel)
        .where(ManagedMCPServerModel.workspace_id == workspace_id)
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    # Batch count agents per MCP server
    counts: dict[UUID, int] = {}
    if rows:
        count_stmt = (
            select(
                AgentMCPServerModel.mcp_server_id,
                func.count(func.distinct(AgentMCPServerModel.agent_id)),
            )
            .where(AgentMCPServerModel.mcp_server_id.in_([r.id for r in rows]))
            .group_by(AgentMCPServerModel.mcp_server_id)
        )
        counts = dict((await session.execute(count_stmt)).all())

    return [_model_to_schema(r, counts.get(r.id, 0)) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedMCPServerRead,
    summary="Get managed MCP server by ID",
)
async def get_mcp_server(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMCPServerRead:
    """Get a managed MCP server configuration by ID."""
    model = await _get_mcp_server(id, session, workspace_id)
    count_stmt = select(func.count(func.distinct(AgentMCPServerModel.agent_id))).where(
        AgentMCPServerModel.mcp_server_id == model.id
    )
    agent_count = await session.scalar(count_stmt) or 0
    return _model_to_schema(model, agent_count)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed MCP server",
)
async def delete_mcp_server(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed MCP server configuration permanently."""
    model = await _get_mcp_server(id, session, workspace_id)

    # RESTRICT: check if any agent references this MCP server
    stmt = select(AgentMCPServerModel.agent_id).where(
        AgentMCPServerModel.mcp_server_id == model.id
    )
    result = await session.execute(stmt)
    if result.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete MCP server: it is referenced by one or more agents",
        )

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
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMCPServerRead:
    """Update an MCP server configuration."""
    model = await _get_mcp_server(id, session, workspace_id)

    model.name = request.name
    mcp_server_config = MCPServer(**request.mcp_server.model_dump())
    model.mcp_server_config = mcp_server_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()

    # Cascade recompute: update all agents referencing this MCP server
    stmt = select(AgentMCPServerModel.agent_id).where(
        AgentMCPServerModel.mcp_server_id == model.id
    )
    result = await session.execute(stmt)
    for (agent_id,) in result.all():
        await recompute_engine_config(session, agent_id)

    await session.refresh(model)
    return _model_to_schema(model)


def _get_transport(config: MCPServer):
    """Return the appropriate MCP transport context manager."""
    logger.debug(f"Creating transport for '{config.name}' ({config.transport})")
    try:
        match config.transport:
            case "stdio":
                server_params = StdioServerParameters(
                    command=config.command,  # type: ignore[arg-type]
                    args=config.args,
                    env=config.env or None,
                    cwd=config.cwd,
                )
                return stdio_client(server=server_params)
            case "streamable_http":
                return streamablehttp_client(
                    url=config.url,  # type: ignore[arg-type]
                    headers=config.headers or None,
                )
            case "sse":
                return sse_client(
                    url=config.url,  # type: ignore[arg-type]
                    headers=config.headers or None,
                )
            case "websocket":
                return websocket_client(
                    url=config.url,  # type: ignore[arg-type]
                )
            case _:
                raise ValueError(
                    f"Unsupported transport: {config.transport}"
                )
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Transport creation failed for '{config.name}': {e}")
        raise ConnectionError(
            f"Failed to create transport '{config.transport}': {e}"
        ) from e


async def _list_tools(mcp_session: ClientSession) -> list[MCPToolSchema]:
    """List tools from an initialized MCP session."""
    logger.debug("Listing tools from MCP session")
    try:
        result = await mcp_session.list_tools()
        logger.info(f"Discovered {len(result.tools)} tools")
        return [
            MCPToolSchema(
                name=t.name,
                description=t.description,
                input_schema=t.inputSchema,
            )
            for t in result.tools
        ]
    except Exception as e:
        logger.error(f"Failed to list tools: {e}")
        raise RuntimeError(f"Failed to list tools: {e}") from e


async def _discover_tools(config: MCPServer) -> list[MCPToolSchema]:
    """Connect to an MCP server, list its tools, and clean up."""
    logger.info(f"Connecting to MCP server '{config.name}'")
    try:
        transport_ctx = _get_transport(config)
        async with transport_ctx as streams:
            read_stream, write_stream = streams[0], streams[1]
            async with ClientSession(read_stream, write_stream) as mcp_session:
                await mcp_session.initialize()
                logger.info(f"Connected to MCP server '{config.name}'")
                return await _list_tools(mcp_session)
    except (ValueError, RuntimeError):
        raise
    except BaseException as e:
        if isinstance(e, ExceptionGroup):
            for sub in e.exceptions:
                logger.error(f"Connection failed for '{config.name}': {sub}", exc_info=sub)
        else:
            logger.error(f"Connection failed for '{config.name}': {e}", exc_info=e)
        raise ConnectionError(
            f"Failed to connect to MCP server: {e}"
        ) from e


@router.post(
    "/{id}/tools",
    response_model=MCPToolsResponse,
    summary="Discover tools from an MCP server",
)
async def discover_tools(
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> MCPToolsResponse:
    """Connect to an MCP server and return its available tools."""
    model = await _get_mcp_server(id, session, workspace_id)
    config = MCPServer(**model.mcp_server_config)

    try:
        tools = await asyncio.wait_for(
            _discover_tools(config),
            timeout=DISCOVER_TOOLS_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"MCP server '{config.name}' did not respond within {DISCOVER_TOOLS_TIMEOUT_SECONDS}s",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        ) from e

    return MCPToolsResponse(tools=tools)
