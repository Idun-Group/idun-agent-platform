"""Helper that admin routers call after every mutating commit.

Wraps ``orchestrate_reload`` (Phase 6) — until then this is a no-op so the
Phase 5 router code can already include the call site without errors.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


async def trigger_reload(request: Request, session) -> JSONResponse | None:
    """Phase 6 attaches a real engine + reload orchestrator to ``app.state``.

    Until then this is a no-op so admin endpoints can call it
    unconditionally and Phase 6 only has to flip a single flag.
    """
    orchestrator = getattr(request.app.state, "reload_orchestrator", None)
    if orchestrator is None:
        return None
    return await orchestrator(request, session)
