"""Unit tests for /admin/api/v1/runtime/status."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_schema.standalone import StandaloneReloadStatus
from idun_agent_standalone.services import runtime_state


@pytest.mark.asyncio
async def test_returns_404_when_no_row(unconfigured_app, sessionmaker):
    transport = ASGITransport(app=unconfigured_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/runtime/status")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_returns_persisted_reload_row(unconfigured_app, sessionmaker):
    async with sessionmaker() as session:
        await runtime_state.record_reload_outcome(
            session,
            status=StandaloneReloadStatus.RELOAD_FAILED,
            message="Engine reload failed; config not saved.",
            error="ImportError: no module named 'app'",
            config_hash=None,
            reloaded_at=datetime(2026, 5, 5, 12, 0, tzinfo=UTC),
        )
        await session.commit()

    transport = ASGITransport(app=unconfigured_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/runtime/status")

    assert response.status_code == 200
    body = response.json()
    assert body["lastStatus"] == "reload_failed"
    assert body["lastMessage"] == "Engine reload failed; config not saved."
    assert body["lastError"].startswith("ImportError")
    assert body["lastReloadedAt"] is not None
