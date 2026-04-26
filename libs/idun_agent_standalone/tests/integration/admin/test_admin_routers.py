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
async def test_change_password_happy_path(tmp_path, monkeypatch):
    """Successful rotation: old hash dies, new hash works, caller stays in."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'cp.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("first-pw"))
    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("first-pw")))
        await s.commit()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post(
            "/admin/api/v1/auth/login", json={"password": "first-pw"}
        )
        assert r.status_code == 200, r.text

        rc = await c.post(
            "/admin/api/v1/auth/change-password",
            json={"current": "first-pw", "new": "second-pw"},
        )
        assert rc.status_code == 200, rc.text
        assert "sid" in rc.cookies  # caller's cookie was reissued

        # The new password should now log a fresh client in.
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as c2:
            r2 = await c2.post(
                "/admin/api/v1/auth/login", json={"password": "second-pw"}
            )
            assert r2.status_code == 200, r2.text
            r_old = await c2.post(
                "/admin/api/v1/auth/login", json={"password": "first-pw"}
            )
            assert r_old.status_code == 401


@pytest.mark.asyncio
async def test_change_password_rejects_wrong_current(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'cw.db'}")
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
        await c.post("/admin/api/v1/auth/login", json={"password": "right"})
        rc = await c.post(
            "/admin/api/v1/auth/change-password",
            json={"current": "wrong", "new": "newpasswd"},
        )
        assert rc.status_code == 401


@pytest.mark.asyncio
async def test_change_password_rejects_short_new_password(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'cs.db'}")
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
        await c.post("/admin/api/v1/auth/login", json={"password": "right"})
        rc = await c.post(
            "/admin/api/v1/auth/change-password",
            json={"current": "right", "new": "short"},
        )
        # Pydantic raises a RequestValidationError; the standalone's
        # global handler maps that to a 400 with error="validation_failed".
        assert rc.status_code == 400, rc.text
        assert rc.json()["error"] == "validation_failed"


@pytest.mark.asyncio
async def test_session_issued_before_rotation_is_rejected(tmp_path, monkeypatch):
    """A cookie minted before password_rotated_at must fail auth.

    Bug-6 regression: without iat-vs-rotated comparison, rotating the
    password didn't actually log the previous session out.
    """
    import time as _time

    from idun_agent_standalone.auth.session import sign_session

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'sr.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("right"))
    app, sm = await make_test_app()

    # Stamp an iat that predates the row's password_rotated_at.
    stale_token = sign_session(
        secret="s" * 40, payload={"uid": "admin", "iat": int(_time.time()) - 1000}
    )
    from datetime import UTC, datetime

    async with sm() as s:
        s.add(
            AdminUserRow(
                id="admin",
                password_hash=hash_password("right"),
                password_rotated_at=datetime.now(UTC),
            )
        )
        await s.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://t",
        cookies={"sid": stale_token},
    ) as c:
        r = await c.get("/admin/api/v1/auth/me")
        assert r.status_code == 401, r.text


@pytest.mark.asyncio
async def test_sliding_renewal_refreshes_cookie(tmp_path, monkeypatch):
    """When the cookie age crosses 90% of TTL, the response sets a fresh one."""
    import time as _time

    from idun_agent_standalone.auth.session import sign_session

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'sl.db'}")
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "password")
    monkeypatch.setenv("IDUN_SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("IDUN_ADMIN_PASSWORD_HASH", hash_password("right"))
    monkeypatch.setenv("IDUN_SESSION_TTL_SECONDS", "100")
    app, sm = await make_test_app()
    async with sm() as s:
        s.add(AdminUserRow(id="admin", password_hash=hash_password("right")))
        await s.commit()

    # Forge a cookie that's already 95 seconds old (95% of 100s TTL) by
    # manipulating its iat. itsdangerous stamps its own timestamp on
    # serialization; we cannot rewrite that easily, so instead rely on the
    # serializer's behaviour: a cookie whose serialized timestamp is in
    # the recent past will be flagged for refresh once age > 90% of TTL.
    # Easier route: set TTL to 1 second and sleep 1.0 second so age
    # crosses the threshold while the serializer still considers the
    # cookie valid (we'll bump TTL while the test is running).
    monkeypatch.setenv("IDUN_SESSION_TTL_SECONDS", "1")
    # The settings are read once per request from app.state, but
    # make_test_app caches the StandaloneSettings instance — re-read so
    # the TTL change is observed by require_auth.
    from idun_agent_standalone.settings import StandaloneSettings

    app.state.settings = StandaloneSettings()

    token = sign_session(
        secret="s" * 40, payload={"uid": "admin", "iat": int(_time.time())}
    )

    # Sleep just under TTL so the cookie is still valid but >90% aged.
    _time.sleep(0.95)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://t",
        cookies={"sid": token},
    ) as c:
        r = await c.get("/admin/api/v1/auth/me")
        assert r.status_code == 200, r.text
        # Renewal middleware should have set a fresh cookie.
        assert "sid" in r.cookies, r.headers.get("set-cookie", "")


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
async def test_integrations_collection_crud(tmp_path, monkeypatch):
    """CRUD plus the per-id read added for spec §3.3 symmetry."""
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'int.db'}"
    )
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", "none")
    app, _ = await make_test_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.post(
            "/admin/api/v1/integrations",
            json={
                "kind": "discord",
                "config": {"bot_token": "T"},
                "enabled": True,
            },
        )
        assert r.status_code == 201, r.text
        iid = r.json()["id"]

        # Per-id GET (added in A3) should return the same payload.
        r_get = await c.get(f"/admin/api/v1/integrations/{iid}")
        assert r_get.status_code == 200, r_get.text
        body = r_get.json()
        assert body["id"] == iid
        # Provider casing is normalized to the canonical schema enum
        # (P2.2) — see ``IntegrationProvider`` in idun_agent_schema.
        assert body["kind"] == "DISCORD"
        assert body["enabled"] is True
        assert body["config"] == {"bot_token": "T"}

        # Missing id → 404.
        r_missing = await c.get("/admin/api/v1/integrations/does-not-exist")
        assert r_missing.status_code == 404

        # Patch then re-read.
        r_patch = await c.patch(
            f"/admin/api/v1/integrations/{iid}", json={"enabled": False}
        )
        assert r_patch.status_code == 200
        r2 = await c.get(f"/admin/api/v1/integrations/{iid}")
        assert r2.json()["enabled"] is False

        r_del = await c.delete(f"/admin/api/v1/integrations/{iid}")
        assert r_del.status_code == 204
        r_after = await c.get(f"/admin/api/v1/integrations/{iid}")
        assert r_after.status_code == 404


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
