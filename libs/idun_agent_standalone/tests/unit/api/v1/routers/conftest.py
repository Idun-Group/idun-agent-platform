"""Shared fixtures for ``/admin/api/v1/*`` router unit tests.

These fixtures spin up an in-memory SQLite database plus a minimal
FastAPI app shell wired only with the admin exception handlers and the
specific router under test. ``IDUN_ADMIN_AUTH_MODE`` is forced to
``NONE`` so ``require_auth`` is a pass-through — auth gating gets its
own dedicated coverage in ``test_require_auth.py``.

The ``sessionmaker`` fixture is a real ``async_sessionmaker`` so tests
can open their own ``async with sessionmaker() as session:`` block to
seed rows independently of the request session, which mirrors how the
production app composes its DB access.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from idun_agent_standalone.api.v1.deps import get_session
from idun_agent_standalone.api.v1.errors import (
    register_admin_exception_handlers,
)
from idun_agent_standalone.core.settings import AuthMode
from idun_agent_standalone.infrastructure.db import (
    models,  # noqa: F401  registers ORMs on Base
)
from idun_agent_standalone.infrastructure.db.session import Base
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    create_async_engine,
)
from sqlalchemy.ext.asyncio import (
    async_sessionmaker as _async_sessionmaker,
)


@pytest.fixture
async def db_engine() -> AsyncIterator[AsyncEngine]:
    """In-memory async SQLite engine with all standalone ORMs created."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
def sessionmaker(db_engine: AsyncEngine) -> _async_sessionmaker:
    """Async sessionmaker bound to the in-memory engine."""
    return _async_sessionmaker(db_engine, expire_on_commit=False)


@pytest.fixture
def unconfigured_app(sessionmaker: _async_sessionmaker) -> FastAPI:
    """A minimal admin FastAPI app with the runtime router mounted.

    "Unconfigured" describes the runtime posture, not the app — there
    is no agent row and no engine in this fixture, mirroring the
    fresh-install state where ``GET /admin/api/v1/runtime/status`` is
    most likely to return 404 before the operator's first save.
    """
    from idun_agent_standalone.api.v1.routers.runtime import (
        router as runtime_router,
    )

    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(runtime_router)

    settings = SimpleNamespace(
        auth_mode=AuthMode.NONE,
        session_secret="x" * 32,
        session_ttl_hours=24,
    )
    app.state.settings = settings
    app.state.sessionmaker = sessionmaker

    async def override_session() -> AsyncIterator:
        async with sessionmaker() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    return app
