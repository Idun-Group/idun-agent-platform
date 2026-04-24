"""Standalone FastAPI app factory.

Phase 1 ships a minimal skeleton: just /admin/api/v1/health. Phase 6 will
flesh this out to compose the engine app, register admin routers, attach
the traces observer, and mount the static UI.
"""

from __future__ import annotations

from fastapi import FastAPI

from idun_agent_standalone.admin.routers import health


def create_standalone_app(settings) -> FastAPI:  # noqa: ANN001 — typed in Phase 6
    """Construct the full standalone application.

    Phase 1 stub. Phase 6 wires engine + admin + traces + static UI.
    """
    app = FastAPI(title="Idun Agent Standalone")
    app.include_router(health.router)
    return app


async def create_standalone_app_for_testing() -> FastAPI:
    """Minimal factory for Phase 1 tests — no DB, no engine, just /health."""
    app = FastAPI(title="Idun Agent Standalone (test)")
    app.include_router(health.router)
    return app
