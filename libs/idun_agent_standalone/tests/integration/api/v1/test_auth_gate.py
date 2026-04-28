"""Integration tests for the admin auth gate end-to-end through ASGI.

These tests mount a router behind ``Depends(require_auth)`` exactly the
way ``app.py`` does, then drive it through ``httpx.ASGITransport`` to
prove the gate intercepts before the route ever runs.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.api.v1.deps import require_auth
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings


def _build_app(auth_mode: AuthMode) -> FastAPI:
    """Mirror ``app.py``: a bare app with one gated admin route."""
    app = FastAPI()
    app.state.settings = StandaloneSettings(auth_mode=auth_mode)

    router = APIRouter(prefix="/admin/api/v1/probe", tags=["admin"])

    @router.get("")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(router, dependencies=[Depends(require_auth)])
    return app


async def test_admin_route_passes_in_none_mode() -> None:
    """In ``AuthMode.NONE`` the gate is transparent."""
    app = _build_app(AuthMode.NONE)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/probe")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_admin_route_blocked_in_password_mode() -> None:
    """In ``AuthMode.PASSWORD`` the gate returns 503 until auth lands."""
    app = _build_app(AuthMode.PASSWORD)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/probe")
    assert response.status_code == 503
    assert "IDUN_ADMIN_AUTH_MODE=none" in response.json()["detail"]
