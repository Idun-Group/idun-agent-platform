"""Integration tests for the admin auth gate end-to-end through ASGI.

These tests mount a router behind ``Depends(require_auth)`` exactly the
way ``app.py`` does, then drive it through ``httpx.ASGITransport`` to
prove the gate intercepts before the route ever runs.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import require_auth
from idun_agent_standalone.core.security import sign_session_id
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.infrastructure.db.models.session import (
    StandaloneSessionRow,
)


def _build_app(
    auth_mode: AuthMode, *, sessionmaker, session_secret: str = "x" * 64
) -> FastAPI:
    """Mirror ``app.py``: a bare app with one gated admin route."""
    app = FastAPI()
    if auth_mode == AuthMode.PASSWORD:
        settings = StandaloneSettings(
            auth_mode=auth_mode,
            session_secret=session_secret,
        )
    else:
        settings = StandaloneSettings(auth_mode=auth_mode)
    app.state.settings = settings
    app.state.sessionmaker = sessionmaker

    router = APIRouter(prefix="/admin/api/v1/probe", tags=["admin"])

    @router.get("")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(router, dependencies=[Depends(require_auth)])
    return app


async def test_admin_route_passes_in_none_mode(async_session) -> None:
    """In ``AuthMode.NONE`` the gate is transparent."""

    class _Sm:
        def __call__(self):
            return _NullCtx()

    class _NullCtx:
        async def __aenter__(self):
            return async_session

        async def __aexit__(self, *_a):
            return None

    app = _build_app(AuthMode.NONE, sessionmaker=_Sm())
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/probe")
    assert response.status_code == 200


async def test_admin_route_blocked_in_password_mode_without_cookie(
    async_session,
) -> None:
    """Password mode + no cookie → 401."""

    class _Sm:
        def __call__(self):
            return _Ctx()

    class _Ctx:
        async def __aenter__(self):
            return async_session

        async def __aexit__(self, *_a):
            return None

    app = _build_app(AuthMode.PASSWORD, sessionmaker=_Sm())
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/probe")
    assert response.status_code == 401


async def test_admin_route_passes_in_password_mode_with_valid_cookie(
    async_session,
) -> None:
    """A signed cookie that maps to a live session row → pass-through."""
    secret = "x" * 64
    session_id = "live-session-token-1234567890"
    async_session.add(
        StandaloneSessionRow(
            id=session_id,
            user_id="singleton",
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    await async_session.commit()

    class _Sm:
        def __call__(self):
            return _Ctx()

    class _Ctx:
        async def __aenter__(self):
            return async_session

        async def __aexit__(self, *_a):
            return None

    app = _build_app(AuthMode.PASSWORD, sessionmaker=_Sm(), session_secret=secret)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set("idun_session", sign_session_id(session_id, secret))
        response = await client.get("/admin/api/v1/probe")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
