"""Atomic commit + engine-reload helper used by every mutating admin route.

Per spec §7.1 the database transaction MUST roll back if the engine fails
to initialize the new config — otherwise the persisted state diverges
from the live runtime (the bad config replays on the next process boot
even though the engine has recovered to the previous good config).

The helper accepts an open ``AsyncSession`` whose pending changes have
already been added but NOT committed. It:

1. ``await session.flush()`` — writes pending mutations so subsequent
   reads in this session see them (``assemble_engine_config`` runs
   against the same session) without committing.
2. Calls ``orchestrate_reload(...)`` against the new state.
3. On ``reloaded`` / ``restart_required``: ``await session.commit()``.
4. On ``init_failed`` (recovered or not): ``await session.rollback()`` so
   the DB returns to the pre-mutation state.

Returns a :class:`fastapi.responses.JSONResponse` describing the failure
or restart-required outcome, or ``None`` on success (router returns its
normal payload).
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession


async def trigger_reload(request: Request, session) -> JSONResponse | None:
    """Legacy no-op hook retained for tests / callers that already commit.

    ``commit_with_reload`` (below) is the production path. This stub
    remains because some unit tests stub ``app.state.reload_orchestrator``
    directly and rely on it being callable.
    """
    orchestrator = getattr(request.app.state, "reload_orchestrator", None)
    if orchestrator is None:
        return None
    return await orchestrator(request, session)


async def commit_with_reload(
    request: Request, session: AsyncSession
) -> JSONResponse | None:
    """Flush pending DB writes, run the engine reload, then commit/rollback.

    This is the atomic counterpart to the legacy "commit then reload"
    pattern. Init failure rolls the DB back so the persisted state stays
    consistent with the live runtime.

    Returns ``None`` on success — caller serializes its normal response
    payload. Returns a ``JSONResponse`` on ``restart_required`` (202) or
    ``init_failed`` (500). On 500 the response body includes a
    ``recovered`` flag indicating whether the previous config still
    serves traffic.
    """
    orchestrator = getattr(request.app.state, "reload_orchestrator", None)
    if orchestrator is None:
        # No live orchestrator — used in tests that exercise only the
        # router-level CRUD without an engine. Commit so the test's
        # subsequent reads observe the change.
        await session.commit()
        return None

    # Surface pending writes to subsequent reads in this session
    # (``assemble_engine_config`` queries via the same session).
    await session.flush()

    response = await orchestrator(request, session)

    if response is None:
        await session.commit()
        return None

    status_code = response.status_code
    if status_code == 202:
        # Structural change: persist the new state so a process restart
        # picks it up.
        await session.commit()
        return response

    # init_failed (500) or anything else considered a failure → roll back.
    await session.rollback()
    return response
