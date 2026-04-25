"""``GET /admin/api/v1/config/export`` round-trips DB state to YAML."""

from __future__ import annotations

import pytest
import yaml
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.testing_app import make_test_app


@pytest.mark.asyncio
async def test_export_endpoint_round_trips_yaml(tmp_path, monkeypatch):
    """Seed an agent + guardrails, export, parse, assert known fields land."""
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'export.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        # Seed an agent so the export has a payload.
        r = await c.put(
            "/admin/api/v1/agent",
            json={
                "name": "exported-agent",
                "framework": "langgraph",
                "graph_definition": "module:graph",
                "config": {"checkpointer": {"type": "memory"}},
            },
        )
        assert r.status_code == 200, r.text

        # Export should round-trip the agent name + framework.
        resp = await c.get("/admin/api/v1/config/export")
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("application/yaml")
        assert "filename=idun-config.yaml" in resp.headers.get(
            "content-disposition", ""
        )

        body = yaml.safe_load(resp.text)
        assert body["agent"]["type"] == "LANGGRAPH"
        assert body["agent"]["config"]["name"] == "exported-agent"
        assert (
            body["agent"]["config"]["graph_definition"] == "module:graph"
        )


@pytest.mark.asyncio
async def test_export_requires_auth_in_password_mode(tmp_path, monkeypatch):
    """In password mode, export requires a valid session cookie."""
    from idun_agent_standalone.auth.password import hash_password
    from idun_agent_standalone.db.models import AdminUserRow

    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'export-auth.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("pw"))

    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("pw")))
        await s.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        # Without cookie → 401.
        r = await c.get("/admin/api/v1/config/export")
        assert r.status_code == 401
