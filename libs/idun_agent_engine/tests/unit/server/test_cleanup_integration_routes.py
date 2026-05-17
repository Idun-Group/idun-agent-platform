"""Tests for integration route teardown inside cleanup_agent."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import APIRouter, FastAPI

from idun_agent_engine.server.lifespan import cleanup_agent


def _add_fake_integration_route(app: FastAPI) -> None:
    router = APIRouter()

    @router.post("/webhook")
    async def webhook() -> dict:
        return {"ok": True}

    app.include_router(router, prefix="/integrations/fake")


@pytest.mark.asyncio
async def test_cleanup_removes_tracked_integration_routes():
    app = FastAPI()

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    before = list(app.router.routes)
    _add_fake_integration_route(app)
    app.state.integration_routes = [r for r in app.router.routes if r not in before]

    await cleanup_agent(app)

    paths = [getattr(r, "path", "") for r in app.router.routes]
    assert "/health" in paths
    assert "/integrations/fake/webhook" not in paths
    assert app.state.integration_routes == []


@pytest.mark.asyncio
async def test_cleanup_calls_each_integration_shutdown():
    app = FastAPI()
    integration_a = AsyncMock()
    integration_b = AsyncMock()
    app.state.integrations = [integration_a, integration_b]

    await cleanup_agent(app)

    integration_a.shutdown.assert_awaited_once()
    integration_b.shutdown.assert_awaited_once()
    assert app.state.integrations == []


@pytest.mark.asyncio
async def test_cleanup_is_idempotent_without_tracking_attribute():
    app = FastAPI()

    await cleanup_agent(app)

    assert getattr(app.state, "integration_routes", None) == []


@pytest.mark.asyncio
async def test_cleanup_called_twice_does_not_raise():
    app = FastAPI()
    before = list(app.router.routes)
    _add_fake_integration_route(app)
    app.state.integration_routes = [r for r in app.router.routes if r not in before]

    await cleanup_agent(app)
    await cleanup_agent(app)

    assert app.state.integration_routes == []
