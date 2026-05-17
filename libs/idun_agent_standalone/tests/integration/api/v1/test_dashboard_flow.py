"""Integration tests for ``GET /admin/api/v1/dashboard``.

Mirrors the dependency-override pattern from ``test_traces.py``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import get_session
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.routers.dashboard import router as dashboard_router
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.models.trace import StandaloneTraceRow


@pytest.fixture
async def admin_app(async_session):
    app = FastAPI()
    register_admin_exception_handlers(app)
    app.state.settings = StandaloneSettings(auth_mode=AuthMode.NONE)
    app.include_router(dashboard_router)

    async def override_session():
        yield async_session

    app.dependency_overrides[get_session] = override_session
    return app


async def test_dashboard_returns_locked_shape_on_empty_db(admin_app):
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/admin/api/v1/dashboard", params={"range": "24h"})
    assert r.status_code == 200
    body = r.json()
    assert body["range"] == "24h"
    assert body["bucketSeconds"] == 300
    assert body["requests"]["total"] == 0
    assert body["topErrors"] == []
    assert body["latency"]["p50Ms"] is None


async def test_dashboard_rejects_unknown_range(admin_app):
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/admin/api/v1/dashboard", params={"range": "90d"})
    assert r.status_code == 422


async def test_dashboard_returns_default_range_when_omitted(admin_app):
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/admin/api/v1/dashboard")
    assert r.status_code == 200
    assert r.json()["range"] == "24h"


async def test_dashboard_with_seeded_traces(admin_app, async_session):
    now = datetime.now(UTC).replace(microsecond=0)
    async_session.add_all(
        [
            StandaloneTraceRow(
                started_at=now - timedelta(minutes=10),
                otel_trace_id=b"\x01" * 16,
                name="root",
                status="OK",
                latency_ms=200,
                total_cost_usd=0.01,
                ended_at=now - timedelta(minutes=9),
            )
        ]
    )
    await async_session.commit()
    transport = ASGITransport(app=admin_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/admin/api/v1/dashboard", params={"range": "1h"})
    body = r.json()
    assert body["requests"]["total"] == 1
    assert body["cost"]["totalUsd"] == pytest.approx(0.01)
