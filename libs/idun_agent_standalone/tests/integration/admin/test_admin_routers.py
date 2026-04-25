"""Smoke tests covering the admin REST surface end-to-end."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.auth.password import hash_password
from idun_agent_standalone.db.models import AdminUserRow
from idun_agent_standalone.testing_app import make_test_app


@pytest.mark.asyncio
async def test_health_under_admin_prefix(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'h.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.get("/admin/api/v1/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_login_success_sets_cookie_then_me_works(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'a.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("hunter2"))

    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("hunter2")))
        await s.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post("/admin/api/v1/auth/login", json={"password": "hunter2"})
        assert r.status_code == 200
        assert "sid" in r.cookies
        me = await c.get("/admin/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["authenticated"] is True


@pytest.mark.asyncio
async def test_login_sets_secure_cookie_under_forwarded_proto_https(
    tmp_path, monkeypatch
):
    """X-Forwarded-Proto: https → cookie must ship with Secure flag.

    Behind Cloud Run / a TLS-terminating proxy ``request.url.scheme`` is
    plain ``http`` unless ProxyHeadersMiddleware rewrites it. Without the
    rewrite the session cookie loses ``Secure`` in production.
    """
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'sec.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("hunter2"))
    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("hunter2")))
        await s.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post(
            "/admin/api/v1/auth/login",
            json={"password": "hunter2"},
            headers={"X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.1"},
        )
        assert r.status_code == 200, r.text
        # httpx exposes the raw Set-Cookie header so we can assert the flag
        # is on the wire, not just trust the cookiejar's parser.
        set_cookie = r.headers.get("set-cookie", "")
        assert "sid=" in set_cookie
        assert "Secure" in set_cookie, set_cookie


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'b.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("right"))
    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("right")))
        await s.commit()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post("/admin/api/v1/auth/login", json={"password": "wrong"})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_singleton_resources_get_put_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 's.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()

    cases = [
        ("guardrails", {"config": {"input": []}, "enabled": True}),
        ("memory", {"config": {"type": "memory"}}),
        ("observability", {"config": [{"provider": "PHOENIX", "enabled": True}]}),
        ("theme", {"config": {"appName": "My Bot", "layout": "branded"}}),
    ]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        for resource, payload in cases:
            r = await c.put(f"/admin/api/v1/{resource}", json=payload)
            assert r.status_code == 200, (resource, r.text)
            r2 = await c.get(f"/admin/api/v1/{resource}")
            assert r2.status_code == 200
            got = r2.json()
            assert got["config"] == payload["config"]


@pytest.mark.asyncio
async def test_mcp_collection_crud(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'mcp.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post(
            "/admin/api/v1/mcp-servers",
            json={
                "name": "time",
                "config": {"transport": "stdio", "command": "docker"},
                "enabled": True,
            },
        )
        assert r.status_code == 201, r.text
        mid = r.json()["id"]
        r2 = await c.get("/admin/api/v1/mcp-servers")
        assert len(r2.json()) == 1
        r3 = await c.patch(
            f"/admin/api/v1/mcp-servers/{mid}", json={"enabled": False}
        )
        assert r3.json()["enabled"] is False
        r4 = await c.delete(f"/admin/api/v1/mcp-servers/{mid}")
        assert r4.status_code == 204


@pytest.mark.asyncio
async def test_prompts_versioning(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'p.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post(
            "/admin/api/v1/prompts",
            json={"prompt_key": "k", "content": "v1", "tags": []},
        )
        assert r.status_code == 201
        r2 = await c.post(
            "/admin/api/v1/prompts",
            json={"prompt_key": "k", "content": "v2", "tags": []},
        )
        assert r2.status_code == 201
        all_p = await c.get("/admin/api/v1/prompts")
        versions = sorted(
            p["version"] for p in all_p.json() if p["prompt_key"] == "k"
        )
        assert versions == [1, 2]
