from __future__ import annotations

from httpx import ASGITransport, AsyncClient


async def test_standalone_boots(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200


async def test_password_app_starts_unauthenticated(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


async def test_seeded_agent_has_id(standalone, seeded_agent):
    assert seeded_agent is not None
