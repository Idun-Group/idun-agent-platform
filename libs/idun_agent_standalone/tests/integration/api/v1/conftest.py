"""Shared fixtures for ``/admin/api/v1/*`` integration tests.

Existing tests in this directory each compose their own ``admin_app``
fixture that mounts a single router. The fixture below is the shared
multi-router composition needed when a test exercises a write through
one router and reads back the after-effect through another (PATCH
``/agent`` → reload pipeline records into ``runtime_state`` → GET
``/runtime/status`` reflects it).
"""

from __future__ import annotations

import pytest_asyncio
from fastapi import FastAPI
from idun_agent_schema.engine.engine import EngineConfig
from idun_agent_standalone.api.v1.deps import (
    get_reload_callable,
    get_session,
)
from idun_agent_standalone.api.v1.errors import (
    register_admin_exception_handlers,
)
from idun_agent_standalone.api.v1.routers.agent import router as agent_router
from idun_agent_standalone.api.v1.routers.runtime import router as runtime_router
from idun_agent_standalone.infrastructure.db.models.agent import (
    StandaloneAgentRow,
)
from idun_agent_standalone.services.reload import ReloadInitFailed


async def _seed_agent(async_session) -> None:
    """Seed the singleton agent row used by the failing-reload fixture."""
    row = StandaloneAgentRow(
        name="Ada",
        base_engine_config={
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            },
        },
    )
    async_session.add(row)
    await async_session.commit()


@pytest_asyncio.fixture
async def standalone_app_with_failing_reload(async_session) -> FastAPI:
    """Standalone admin app whose engine reload callable always fails.

    Mounts the agent + runtime routers against the in-memory
    ``async_session`` from the top-level conftest and overrides
    ``reload_callable`` so any PATCH that reaches round 3 raises
    ``ReloadInitFailed``. This drives the failure-recording branch of
    ``services/reload.commit_with_reload`` end-to-end.
    """

    async def failing_reload(_engine_config: EngineConfig) -> None:
        raise ReloadInitFailed("simulated engine init failure")

    await _seed_agent(async_session)

    app = FastAPI()
    register_admin_exception_handlers(app)
    app.include_router(agent_router)
    app.include_router(runtime_router)
    app.state.reload_callable = failing_reload

    async def override_session():
        yield async_session

    async def override_reload_callable():
        return failing_reload

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_reload_callable] = override_reload_callable

    return app
