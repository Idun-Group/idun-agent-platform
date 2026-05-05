"""``/admin/api/v1/runtime/status`` router.

Read-only operator-facing endpoint exposing the singleton
``runtime_state`` row. Returns the existing
``StandaloneRuntimeReload`` schema (lastStatus / lastMessage /
lastError / lastReloadedAt). 404 when no row exists yet — fresh
install, no reload has been attempted.

The UI polls this every 60s to drive the shell-level
ReloadFailedBanner and the per-page RuntimeStatusCard.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi import status as http_status
from idun_agent_schema.standalone import (
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneReloadStatus,
)
from idun_agent_schema.standalone.runtime_status import StandaloneRuntimeReload

from idun_agent_standalone.api.v1.deps import SessionDep
from idun_agent_standalone.api.v1.errors import AdminAPIError
from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.services import runtime_state

router = APIRouter(prefix="/admin/api/v1/runtime", tags=["admin"])

logger = get_logger(__name__)


@router.get("/status", response_model=StandaloneRuntimeReload)
async def get_runtime_status(session: SessionDep) -> StandaloneRuntimeReload:
    """Return the singleton runtime_state row as a reload-outcome payload.

    404 when no row exists yet (fresh install, no save attempted).
    """
    row = await runtime_state.get(session)
    if row is None:
        raise AdminAPIError(
            status_code=http_status.HTTP_404_NOT_FOUND,
            error=StandaloneAdminError(
                code=StandaloneErrorCode.NOT_FOUND,
                message="No reload outcome recorded yet.",
            ),
        )
    last_status = StandaloneReloadStatus(row.last_status) if row.last_status else None
    return StandaloneRuntimeReload(
        last_status=last_status,
        last_message=row.last_message,
        last_error=row.last_error,
        last_reloaded_at=row.last_reloaded_at,
    )
