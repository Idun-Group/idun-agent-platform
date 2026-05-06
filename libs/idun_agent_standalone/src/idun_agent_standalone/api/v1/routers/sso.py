"""``/admin/api/v1/sso`` router.

Singleton routes for the OIDC provider. SSO has no id in the URL
because there is only one provider per install. Absence of the row
means SSO is not configured and agent routes are unprotected.

Both mutating handlers run under the reload pipeline. Round 2
re-validates the assembled engine config; on success round 3 hot
reloads the engine via the injected reload callable. Structural
changes commit the DB and return ``restart_required``.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
    StandaloneSingletonDeleteResult,
    StandaloneSsoPatch,
    StandaloneSsoRead,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from idun_agent_standalone.api.v1.deps import ReloadCallableDep, SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.sso import StandaloneSsoRow
from idun_agent_standalone.services import reload as reload_service
from idun_agent_standalone.services.reload import commit_with_reload

router = APIRouter(prefix="/admin/api/v1/sso", tags=["admin"])

logger = get_logger(__name__)

_SINGLETON_ID = "singleton"

_NOOP_RELOAD = StandaloneReloadResult(
    status=StandaloneReloadStatus.RELOADED,
    message="No changes.",
)


def _to_read(row: StandaloneSsoRow) -> StandaloneSsoRead:
    return StandaloneSsoRead.model_validate(
        {"sso": row.sso_config, "updated_at": row.updated_at}
    )


async def _load_row(session: AsyncSession) -> StandaloneSsoRow | None:
    return (await session.execute(select(StandaloneSsoRow))).scalar_one_or_none()


@router.get("", response_model=StandaloneSsoRead)
async def get_sso(session: SessionDep) -> StandaloneSsoRead:
    row = await _load_row(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="SSO is not configured.",
            ),
        )
    return _to_read(row)


@router.patch(
    "",
    response_model=StandaloneMutationResponse[StandaloneSsoRead],
)
async def patch_sso(
    body: StandaloneSsoPatch,
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneSsoRead]:
    fields = body.model_fields_set
    row = await _load_row(session)

    if row is None:
        if "sso" not in fields or body.sso is None:
            raise AdminAPIError(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                error=StandaloneAdminError(
                    code=StandaloneErrorCode.VALIDATION_FAILED,
                    message="First write requires sso.",
                ),
            )
        row = StandaloneSsoRow(
            id=_SINGLETON_ID,
            sso_config=body.sso.model_dump(exclude_none=True),
        )
        session.add(row)
    else:
        if not fields:
            logger.debug("admin.sso.patch noop")
            return StandaloneMutationResponse(data=_to_read(row), reload=_NOOP_RELOAD)
        if "sso" in fields and body.sso is not None:
            row.sso_config = body.sso.model_dump(exclude_none=True)

    async with reload_service._reload_mutex:
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)
        await session.refresh(row)

    logger.info("admin.sso.patch status=%s", result.status.value)
    return StandaloneMutationResponse(data=_to_read(row), reload=result)


@router.delete(
    "",
    response_model=StandaloneMutationResponse[StandaloneSingletonDeleteResult],
)
async def delete_sso(
    session: SessionDep,
    reload_callable: ReloadCallableDep,
) -> StandaloneMutationResponse[StandaloneSingletonDeleteResult]:
    row = await _load_row(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No SSO provider configured to delete.",
            ),
        )

    async with reload_service._reload_mutex:
        await session.delete(row)
        await session.flush()
        result = await commit_with_reload(session, reload_callable=reload_callable)

    logger.info("admin.sso.delete status=%s", result.status.value)
    return StandaloneMutationResponse(
        data=StandaloneSingletonDeleteResult(),
        reload=result,
    )
