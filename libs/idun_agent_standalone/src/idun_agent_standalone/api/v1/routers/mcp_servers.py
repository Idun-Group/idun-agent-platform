"""``/admin/api/v1/mcp-servers`` router.

Collection routes for configured MCP servers. POST creates a new row
with an auto derived slug, PATCH applies a shallow update, DELETE
removes a row. Slug is sticky on rename so URLs stay stable for
clients that already hold a slug or id.

Mutating handlers run under the reload pipeline. The assembled
config is revalidated on every change; failures roll back with a 422
and structured field errors. Successful changes commit the DB and
hot reload the engine, or return ``restart_required`` for changes
the running engine cannot pick up.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneConnectionCheck,
    StandaloneDeleteResult,
    StandaloneErrorCode,
    StandaloneFieldError,
    StandaloneMCPServerCreate,
    StandaloneMCPServerPatch,
    StandaloneMCPServerRead,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.mcp_server import (
    StandaloneMCPServerRow,
)
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.connection_checks import check_mcp_server
from idun_agent_standalone.services.reload import commit_with_reload
from idun_agent_standalone.services.slugs import (
    SlugConflictError,
    SlugNormalizationError,
    ensure_unique_slug,
    normalize_slug,
)

router = APIRouter(prefix="/admin/api/v1/mcp-servers", tags=["admin"])

logger = get_logger(__name__)

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)


def _to_read(row: StandaloneMCPServerRow) -> StandaloneMCPServerRead:
    """Translate the row into the wire model.

    The schema's ``mcp_server`` field revalidates from the stored JSON
    when the read model is built, so the response always reflects the
    current schema shape.
    """
    return StandaloneMCPServerRead.model_validate(
        {
            "id": row.id,
            "slug": row.slug,
            "name": row.name,
            "enabled": row.enabled,
            "mcp_server": row.mcp_server_config,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    )


async def _load_by_id(session: AsyncSession, mcp_id: UUID) -> StandaloneMCPServerRow:
    row = (
        await session.execute(
            select(StandaloneMCPServerRow).where(
                StandaloneMCPServerRow.id == str(mcp_id)
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message=f"No MCP server with id {mcp_id}.",
            ),
        )
    return row


@router.get("", response_model=list[StandaloneMCPServerRead])
async def list_mcp_servers(
    session: SessionDep,
) -> list[StandaloneMCPServerRead]:
    """Return all configured MCP server rows ordered by created_at."""
    rows = (
        (
            await session.execute(
                select(StandaloneMCPServerRow).order_by(
                    StandaloneMCPServerRow.created_at
                )
            )
        )
        .scalars()
        .all()
    )
    return [_to_read(row) for row in rows]


@router.post(
    "",
    response_model=StandaloneMutationResponse[StandaloneMCPServerRead],
    status_code=http_status.HTTP_201_CREATED,
)
async def create_mcp_server(
    body: StandaloneMCPServerCreate,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneMCPServerRead]:
    """Create a new MCP server row.

    Slug is derived from ``name`` and made unique with numeric
    suffixes on collision. Empty post normalization slug returns 422.
    """
    try:
        candidate = normalize_slug(body.name)
    except SlugNormalizationError as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.VALIDATION_FAILED,
                message="Cannot derive a slug from the provided name.",
                field_errors=[
                    StandaloneFieldError(field="name", message=str(exc), code="invalid")
                ],
            ),
        ) from exc

    try:
        slug = await ensure_unique_slug(
            session,
            StandaloneMCPServerRow,
            StandaloneMCPServerRow.slug,
            candidate,
        )
    except SlugConflictError as exc:
        raise AdminAPIError(
            status_code=http_status.HTTP_409_CONFLICT,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.CONFLICT,
                message=str(exc),
            ),
        ) from exc

    row = StandaloneMCPServerRow(
        slug=slug,
        name=body.name,
        enabled=body.enabled,
        mcp_server_config=body.mcp_server.model_dump(exclude_none=True),
    )
    session.add(row)

    async with reload_service._reload_mutex:
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.mcp_servers.create id=%s slug=%s status=%s",
        row.id,
        row.slug,
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.get("/{mcp_id}", response_model=StandaloneMCPServerRead)
async def get_mcp_server(mcp_id: UUID, session: SessionDep) -> StandaloneMCPServerRead:
    """Return a single MCP server row or 404."""
    row = await _load_by_id(session, mcp_id)
    return _to_read(row)


@router.patch(
    "/{mcp_id}",
    response_model=StandaloneMutationResponse[StandaloneMCPServerRead],
)
async def patch_mcp_server(
    mcp_id: UUID,
    body: StandaloneMCPServerPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneMCPServerRead]:
    """Apply a shallow update to an existing MCP server row.

    Only fields present in the body are touched. Slug is sticky on
    rename so existing references stay valid. Inner ``mcp_server`` is
    replaced wholesale when provided.
    """
    fields = body.model_fields_set
    row = await _load_by_id(session, mcp_id)

    if not fields:
        logger.debug("admin.mcp_servers.patch noop id=%s", row.id)
        return StandaloneMutationResponse(data=_to_read(row), reload=_NOOP_RELOAD)

    async with reload_service._reload_mutex:
        if "name" in fields and body.name is not None:
            row.name = body.name
        if "enabled" in fields and body.enabled is not None:
            row.enabled = body.enabled
        if "mcp_server" in fields and body.mcp_server is not None:
            row.mcp_server_config = body.mcp_server.model_dump(exclude_none=True)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info(
        "admin.mcp_servers.patch id=%s fields=%s status=%s",
        row.id,
        sorted(fields),
        result.status.value,
    )
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.delete(
    "/{mcp_id}",
    response_model=StandaloneMutationResponse[StandaloneDeleteResult],
)
async def delete_mcp_server(
    mcp_id: UUID,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneDeleteResult]:
    """Remove an MCP server row.

    Engine assembly drops the row from the active set. If the row was
    the last one, the engine continues without an MCP layer.
    """
    row = await _load_by_id(session, mcp_id)
    row_id = row.id

    async with reload_service._reload_mutex:
        await session.delete(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)

    logger.info(
        "admin.mcp_servers.delete id=%s status=%s",
        row_id,
        result.status.value,
    )
    return StandaloneMutationResponse(
        data=StandaloneDeleteResult(id=UUID(row_id)),
        reload=result,
    )


@router.post("/{mcp_id}/tools", response_model=StandaloneConnectionCheck)
async def list_mcp_server_tools(
    mcp_id: UUID, session: SessionDep
) -> StandaloneConnectionCheck:
    """Discover tools exposed by a single MCP server.

    Doubles as a connection check — if the server cannot be reached or
    cannot speak MCP, ``ok=False`` carries the upstream error in the
    response body. ``details.tools`` carries the discovered tool names
    on success.
    """
    row = await _load_by_id(session, mcp_id)
    result = await check_mcp_server(row.mcp_server_config)
    logger.info(
        "admin.mcp_servers.tools id=%s ok=%s tool_count=%s",
        row.id,
        result.ok,
        (result.details or {}).get("toolCount"),
    )
    return result
