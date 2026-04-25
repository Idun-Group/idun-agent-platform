"""GET /admin/api/v1/mcp-servers must surface engine init failures.

Spec D6: when an MCP server fails to initialise, the standalone admin
list endpoint must return ``status: "failed"`` for that row so the UI
can render a red badge without the operator having to scrape engine
logs.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.testing_app import make_test_app


@pytest.mark.asyncio
async def test_list_marks_servers_as_failed_when_engine_recorded_failure(
    tmp_path, monkeypatch
):
    """Two MCP rows seeded; one is in app.state.failed_mcp_servers.

    The list endpoint must report ``status: "failed"`` for that row and
    keep the other one as ``status: "running"``.
    """
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'mcp-fail.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()

    # Simulate the engine having recorded one failure during boot/reload.
    app.state.failed_mcp_servers = [
        {
            "name": "broken",
            "kind": "stdio",
            "reason": "command '/nonexistent' not found",
        }
    ]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        # Seed two rows: one matching the failure, one not.
        r1 = await c.post(
            "/admin/api/v1/mcp-servers",
            json={
                "name": "broken",
                "config": {"transport": "stdio", "command": "/nonexistent"},
                "enabled": True,
            },
        )
        assert r1.status_code == 201, r1.text

        r2 = await c.post(
            "/admin/api/v1/mcp-servers",
            json={
                "name": "healthy",
                "config": {"transport": "stdio", "command": "echo"},
                "enabled": True,
            },
        )
        assert r2.status_code == 201, r2.text

        listing = await c.get("/admin/api/v1/mcp-servers")
        assert listing.status_code == 200, listing.text
        rows = {row["name"]: row for row in listing.json()}

        assert rows["broken"]["status"] == "failed"
        assert "not found" in rows["broken"]["failure_reason"]

        assert rows["healthy"]["status"] == "running"
        assert rows["healthy"]["failure_reason"] is None


@pytest.mark.asyncio
async def test_per_id_get_carries_failure_status(tmp_path, monkeypatch):
    """GET /admin/api/v1/mcp-servers/{id} mirrors the failure flag.

    Otherwise the detail panel in the UI would show "running" while the
    list view shows "failed" — confusing operators.
    """
    monkeypatch.setenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{tmp_path / 'mcp-fail-id.db'}",
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    app.state.failed_mcp_servers = [
        {"name": "broken", "kind": "stdio", "reason": "boom"}
    ]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post(
            "/admin/api/v1/mcp-servers",
            json={
                "name": "broken",
                "config": {"transport": "stdio", "command": "/nope"},
                "enabled": True,
            },
        )
        mid = r.json()["id"]

        detail = await c.get(f"/admin/api/v1/mcp-servers/{mid}")
        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert body["status"] == "failed"
        assert body["failure_reason"] == "boom"


@pytest.mark.asyncio
async def test_list_handles_missing_failed_state(tmp_path, monkeypatch):
    """When the engine never set ``failed_mcp_servers``, every row reports running.

    Defensive: tests using ``make_test_app`` skip the engine wiring and
    the attribute is missing entirely. The router must not raise.
    """
    monkeypatch.setenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{tmp_path / 'mcp-none.db'}",
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    # Intentionally do NOT set app.state.failed_mcp_servers.

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        await c.post(
            "/admin/api/v1/mcp-servers",
            json={
                "name": "any",
                "config": {"transport": "stdio", "command": "echo"},
                "enabled": True,
            },
        )
        rows = (await c.get("/admin/api/v1/mcp-servers")).json()
        assert rows[0]["status"] == "running"
        assert rows[0]["failure_reason"] is None
