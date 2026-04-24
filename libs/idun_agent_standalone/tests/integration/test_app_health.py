"""Smoke test for the standalone app skeleton."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app_for_testing


@pytest.mark.asyncio
async def test_health_returns_ok():
    app = await create_standalone_app_for_testing()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.get("/admin/api/v1/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}
