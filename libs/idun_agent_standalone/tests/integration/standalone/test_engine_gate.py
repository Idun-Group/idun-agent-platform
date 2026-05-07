from __future__ import annotations

from httpx import ASGITransport, AsyncClient


async def test_admin_api_blocked_without_cookie(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


async def test_admin_api_blocked_with_garbage_cookie(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set("idun_session", "not-a-signed-value")
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code == 401


async def test_runtime_config_public_in_password_mode(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/runtime-config.js")
    assert response.status_code == 200


async def test_login_reachable_without_cookie(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/login", json={"password": "wrong"}
        )
    assert response.status_code != 401 or (
        response.json() != {"detail": "Authentication required."}
    )


async def test_admin_api_reachable_after_login(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/admin/api/v1/auth/login", json={"password": "hunter2"}
        )
        assert login.status_code == 200
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code != 401


async def test_none_mode_admin_api_not_gated(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code != 401
