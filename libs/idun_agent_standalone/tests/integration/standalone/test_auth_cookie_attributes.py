from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from _helpers.cookies import parsed_set_cookie


async def test_login_cookie_attributes_over_http(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/login", json={"password": "hunter2"}
        )
    assert response.status_code == 200
    cookie = parsed_set_cookie(response, "idun_session")
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "lax"
    assert cookie["secure"] is False
    assert cookie["path"] == "/"
    assert cookie["max_age"] == 24 * 3600


async def test_login_cookie_secure_when_request_is_https(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/login", json={"password": "hunter2"}
        )
    assert response.status_code == 200
    cookie = parsed_set_cookie(response, "idun_session")
    assert cookie["secure"] is True


async def test_login_cookie_secure_when_forwarded_proto_https(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/admin/api/v1/auth/login",
            json={"password": "hunter2"},
            headers={"X-Forwarded-Proto": "https"},
        )
    assert response.status_code == 200
    cookie = parsed_set_cookie(response, "idun_session")
    assert cookie["secure"] is True


async def test_logout_clears_cookie(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/admin/api/v1/auth/login", json={"password": "hunter2"})
        response = await client.post("/admin/api/v1/auth/logout")
    assert response.status_code == 200
    cookie = parsed_set_cookie(response, "idun_session")
    assert cookie["value"] == ""
