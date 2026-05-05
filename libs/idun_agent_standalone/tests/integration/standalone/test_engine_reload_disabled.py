from __future__ import annotations

from httpx import ASGITransport, AsyncClient


async def test_engine_reload_returns_403(standalone_with_agent):
    transport = ASGITransport(app=standalone_with_agent)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/reload", json={})
    assert response.status_code == 403
    body = response.json()
    detail = body.get("detail", body)
    assert "disabled" in str(detail).lower()


async def test_engine_reload_unreachable_in_admin_only_mode(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/reload", json={})
    assert response.status_code in (403, 404, 405)
