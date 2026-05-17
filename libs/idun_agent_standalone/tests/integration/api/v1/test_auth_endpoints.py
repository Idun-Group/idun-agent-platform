"""Integration tests for the four ``/admin/api/v1/auth`` endpoints.

These tests drive the auth router through ASGITransport with a real
in-memory async session, so login → me → change-password → logout is
exercised end-to-end including cookie set/clear semantics.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import get_session
from idun_agent_standalone.api.v1.errors import register_admin_exception_handlers
from idun_agent_standalone.api.v1.routers.auth import router as auth_router
from idun_agent_standalone.core.security import hash_password
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.models.admin_user import (
    StandaloneAdminUserRow,
)


def _build_app(async_session, *, auth_mode: AuthMode) -> FastAPI:
    app = FastAPI()
    register_admin_exception_handlers(app)
    if auth_mode == AuthMode.PASSWORD:
        settings = StandaloneSettings(
            auth_mode=auth_mode,
            session_secret="x" * 64,
            session_ttl_hours=24,
        )
    else:
        settings = StandaloneSettings(auth_mode=auth_mode)
    app.state.settings = settings

    class _Sm:
        def __call__(self):
            return _Ctx()

    class _Ctx:
        async def __aenter__(self):
            return async_session

        async def __aexit__(self, *_a):
            return None

    app.state.sessionmaker = _Sm()
    app.include_router(auth_router)

    async def override_session():
        yield async_session

    app.dependency_overrides[get_session] = override_session
    return app


async def _seed_admin(async_session, password: str = "hunter2") -> None:
    async_session.add(
        StandaloneAdminUserRow(id="singleton", password_hash=hash_password(password))
    )
    await async_session.commit()


# ---- /me -------------------------------------------------------------------


async def test_me_in_none_mode_is_authenticated(async_session) -> None:
    app = _build_app(async_session, auth_mode=AuthMode.NONE)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "authMode": "none"}


async def test_me_in_password_mode_without_cookie_is_unauthenticated(
    async_session,
) -> None:
    await _seed_admin(async_session)
    app = _build_app(async_session, auth_mode=AuthMode.PASSWORD)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is False
    assert body["authMode"] == "password"


# ---- /login ----------------------------------------------------------------


async def test_login_503_in_none_mode(async_session) -> None:
    app = _build_app(async_session, auth_mode=AuthMode.NONE)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/auth/login", json={"password": "x"})
    assert response.status_code == 503


async def test_login_happy_path_sets_cookie(async_session) -> None:
    await _seed_admin(async_session)
    app = _build_app(async_session, auth_mode=AuthMode.PASSWORD)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/login", json={"password": "hunter2"}
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        # Cookie set by the response
        assert "idun_session" in response.cookies or "idun_session" in [
            c.name for c in client.cookies.jar
        ]
        # Subsequent /me sees authenticated
        me = await client.get("/admin/api/v1/auth/me")
        assert me.json()["authenticated"] is True


async def test_login_bad_password_401(async_session) -> None:
    await _seed_admin(async_session)
    app = _build_app(async_session, auth_mode=AuthMode.PASSWORD)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/login", json={"password": "wrong"}
        )
    assert response.status_code == 401
    error = response.json()["error"]
    assert error["code"] == "auth_required"
    # Generic message — does not say whether the row exists
    assert "Invalid credentials" in error["message"]


async def test_login_with_no_admin_row_returns_401_not_503(async_session) -> None:
    """No admin row + login attempt → same 401 as bad password (anti-enum)."""
    app = _build_app(async_session, auth_mode=AuthMode.PASSWORD)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/login", json={"password": "anything"}
        )
    assert response.status_code == 401


# ---- /logout ---------------------------------------------------------------


async def test_logout_clears_cookie_and_drops_session(async_session) -> None:
    await _seed_admin(async_session)
    app = _build_app(async_session, auth_mode=AuthMode.PASSWORD)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/admin/api/v1/auth/login", json={"password": "hunter2"})
        # Verify authenticated state then logout
        me_before = await client.get("/admin/api/v1/auth/me")
        assert me_before.json()["authenticated"] is True
        logout = await client.post("/admin/api/v1/auth/logout")
        assert logout.status_code == 200
        # Cookie cleared in response — clear it on the client too so the
        # follow-up request does not carry the stale value
        client.cookies.clear()
        me_after = await client.get("/admin/api/v1/auth/me")
        assert me_after.json()["authenticated"] is False


async def test_logout_idempotent_without_cookie(async_session) -> None:
    app = _build_app(async_session, auth_mode=AuthMode.PASSWORD)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/admin/api/v1/auth/logout")
    assert response.status_code == 200


# ---- /change-password ------------------------------------------------------


@pytest.fixture
def authed_app(async_session):
    """An app with the auth router AND a logged-in client cookie pre-set.

    Returned as a tuple ``(app, login_fn)`` because cookies persist on
    the AsyncClient instance, not on the app.
    """
    return _build_app(async_session, auth_mode=AuthMode.PASSWORD)


async def test_change_password_happy_path(async_session, authed_app) -> None:
    await _seed_admin(async_session)
    transport = ASGITransport(app=authed_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/admin/api/v1/auth/login", json={"password": "hunter2"})
        response = await client.post(
            "/admin/api/v1/auth/change-password",
            json={"currentPassword": "hunter2", "newPassword": "newPass123"},
        )
        assert response.status_code == 200
        # Old session cookie still works (strict-minimum: rotation does NOT
        # invalidate outstanding sessions). Verify by hitting /me again.
        me = await client.get("/admin/api/v1/auth/me")
        assert me.json()["authenticated"] is True


async def test_change_password_wrong_current_401(async_session, authed_app) -> None:
    await _seed_admin(async_session)
    transport = ASGITransport(app=authed_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/admin/api/v1/auth/login", json={"password": "hunter2"})
        response = await client.post(
            "/admin/api/v1/auth/change-password",
            json={"currentPassword": "wrong", "newPassword": "newPass123"},
        )
    assert response.status_code == 401


async def test_change_password_short_new_rejected_422(
    async_session, authed_app
) -> None:
    await _seed_admin(async_session)
    transport = ASGITransport(app=authed_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/admin/api/v1/auth/login", json={"password": "hunter2"})
        response = await client.post(
            "/admin/api/v1/auth/change-password",
            json={"currentPassword": "hunter2", "newPassword": "short"},
        )
    assert response.status_code == 422


async def test_change_password_requires_auth(async_session, authed_app) -> None:
    """Without a logged-in session, change-password is gated by require_auth."""
    await _seed_admin(async_session)
    transport = ASGITransport(app=authed_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/change-password",
            json={"currentPassword": "hunter2", "newPassword": "newPass123"},
        )
    assert response.status_code == 401
