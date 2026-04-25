"""Lightweight FastAPI app for admin-router integration tests.

Skips engine composition (which Phase 6 introduces) so admin endpoints can
be exercised against the real DB without requiring a live agent.
"""

from __future__ import annotations

from fastapi import FastAPI

from idun_agent_standalone.admin.routers import (
    agent as agent_router,
)
from idun_agent_standalone.admin.routers import (
    auth as auth_router,
)
from idun_agent_standalone.admin.routers import (
    guardrails as guardrails_router,
)
from idun_agent_standalone.admin.routers import (
    health as health_router,
)
from idun_agent_standalone.admin.routers import (
    integrations as integrations_router,
)
from idun_agent_standalone.admin.routers import (
    mcp_servers as mcp_router,
)
from idun_agent_standalone.admin.routers import (
    memory as memory_router,
)
from idun_agent_standalone.admin.routers import (
    observability as observability_router,
)
from idun_agent_standalone.admin.routers import (
    prompts as prompts_router,
)
from idun_agent_standalone.admin.routers import (
    theme as theme_router,
)
from idun_agent_standalone.admin.routers import (
    traces as traces_router,
)
from idun_agent_standalone.db.base import (
    Base,
    create_db_engine,
    create_sessionmaker,
)
from idun_agent_standalone.errors import install_exception_handlers
from idun_agent_standalone.middleware import (
    install_proxy_headers_middleware,
    install_request_id_middleware,
    install_session_refresh_middleware,
)
from idun_agent_standalone.settings import StandaloneSettings


async def make_test_app() -> tuple[FastAPI, object]:
    """Build a real-DB-backed FastAPI app for admin-router tests.

    Uses ``Base.metadata.create_all`` rather than Alembic so the helper is
    callable inside ``pytest-asyncio`` tests without nested event-loop
    issues. Production boot still goes through Alembic (Phase 6 wires it).
    """
    settings = StandaloneSettings()
    engine = create_db_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = create_sessionmaker(engine)

    app = FastAPI(title="standalone-test")
    install_request_id_middleware(app)
    install_proxy_headers_middleware(app)
    install_session_refresh_middleware(app)
    install_exception_handlers(app)

    app.state.settings = settings
    app.state.sessionmaker = sm
    app.state.db_engine = engine

    app.include_router(health_router.router)
    app.include_router(auth_router.router)
    app.include_router(agent_router.router)
    app.include_router(guardrails_router.router)
    app.include_router(memory_router.router)
    app.include_router(observability_router.router)
    app.include_router(theme_router.router)
    app.include_router(mcp_router.router)
    app.include_router(prompts_router.router)
    app.include_router(integrations_router.router)
    app.include_router(traces_router.router)

    return app, sm
