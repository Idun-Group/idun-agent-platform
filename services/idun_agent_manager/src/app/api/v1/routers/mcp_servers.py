"""Managed MCP Server API.

This router exposes endpoints to create, read, list, update, delete, and
discover tools for managed MCP server configurations. All CRUD endpoints
are project-scoped with RBAC enforcement.

Endpoints (mounted at /projects/{project_id}/mcp-servers):
    POST   /              - Create a new MCP server          (contributor)
    GET    /              - List MCP servers (pagination)     (reader)
    GET    /{id}          - Get a specific MCP server by ID   (reader)
    PATCH  /{id}          - Update an MCP server config       (contributor)
    DELETE /{id}          - Delete an MCP server config       (admin)
    POST   /{id}/tools    - Discover tools from MCP server    (contributor)
"""

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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    CurrentUser,
    get_current_user,
    get_session,
    require_project_role,
    require_workspace,
)
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel

router = APIRouter()

logger = logging.getLogger(__name__)

# Constants
PAGINATION_MAX_LIMIT = 1000
PAGINATION_DEFAULT_LIMIT = 100


async def _get_mcp_server(
    id: str,
    session: AsyncSession,
    workspace_id: UUID,
    project_id: UUID,
) -> ManagedMCPServerModel:
    """Get MCP server config by ID, scoped to workspace and project."""
    try:
        uuid_id = UUID(id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from err

    model = await session.get(ManagedMCPServerModel, uuid_id)
    if not model or model.workspace_id != workspace_id or model.project_id != project_id:
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
    project_id: str,
    request: ManagedMCPServerCreate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMCPServerRead:
    """Create a new managed MCP server configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")

    now = datetime.now(UTC)

    mcp_server_config = MCPServer(**request.mcp_server.model_dump())

    model = ManagedMCPServerModel(
        id=uuid4(),
        name=request.name,
        mcp_server_config=mcp_server_config.model_dump(),
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
    response_model=list[ManagedMCPServerRead],
    summary="List managed MCP servers",
)
async def list_mcp_servers(
    project_id: str,
    limit: int = PAGINATION_DEFAULT_LIMIT,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> list[ManagedMCPServerRead]:
    """List managed MCP server configurations with pagination."""
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

    stmt = (
        select(ManagedMCPServerModel)
        .where(
            ManagedMCPServerModel.workspace_id == access.workspace_id,
            ManagedMCPServerModel.project_id == project_uuid,
        )
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [_model_to_schema(r) for r in rows]


@router.get(
    "/{id}",
    response_model=ManagedMCPServerRead,
    summary="Get managed MCP server by ID",
)
async def get_mcp_server(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMCPServerRead:
    """Get a managed MCP server configuration by ID."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "reader")
    model = await _get_mcp_server(id, session, access.workspace_id, project_uuid)
    return _model_to_schema(model)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete managed MCP server",
)
async def delete_mcp_server(
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> None:
    """Delete a managed MCP server configuration permanently."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "admin")
    model = await _get_mcp_server(id, session, access.workspace_id, project_uuid)
    await session.delete(model)
    await session.flush()


@router.patch(
    "/{id}",
    response_model=ManagedMCPServerRead,
    summary="Update managed MCP server",
)
async def patch_mcp_server(
    project_id: str,
    id: str,
    request: ManagedMCPServerPatch,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> ManagedMCPServerRead:
    """Update an MCP server configuration."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")
    model = await _get_mcp_server(id, session, access.workspace_id, project_uuid)

    model.name = request.name
    mcp_server_config = MCPServer(**request.mcp_server.model_dump())
    model.mcp_server_config = mcp_server_config.model_dump()
    model.updated_at = datetime.now(UTC)

    await session.flush()
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
    project_id: str,
    id: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
    workspace_id: UUID = Depends(require_workspace),
) -> MCPToolsResponse:
    """Connect to an MCP server and return its available tools."""
    project_uuid = UUID(project_id)
    access = await require_project_role(project_uuid, user, session, "contributor")
    model = await _get_mcp_server(id, session, access.workspace_id, project_uuid)
    config = MCPServer(**model.mcp_server_config)

    try:
        tools = await _discover_tools(config)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        ) from e

    return MCPToolsResponse(tools=tools)
