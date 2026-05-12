"""Unmapped paths under ``/admin/api/`` must return a JSON 404 envelope.

Without an explicit catch-all, ``StaticFiles(directory=ui_dir, html=True)``
mounted at ``/`` falls back to ``index.html`` for paths it doesn't know
about — so probes against ``/admin/api/v1/<typo>`` would see the chat UI
HTML bundle instead of a structured 404. That masks routing misses as
"page exists, blank" and trips OpenAPI clients, curl debugging, and any
caller doing ``JSON.parse`` on the response.
"""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient


async def test_unmapped_admin_api_returns_json_404(standalone):
    """A typo'd admin API path returns 404 with the admin error envelope."""
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/nonexistent")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert "/admin/api/v1/nonexistent" in body["error"]["message"]


async def test_unmapped_admin_api_v2_also_404s(standalone):
    """The catch-all covers any ``/admin/api/`` subpath, not just v1."""
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v2/something")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


async def test_admin_spa_still_serves_html(standalone):
    """``/admin/`` (the SPA root) is not shadowed by the API catch-all."""
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")


async def test_real_admin_route_is_not_shadowed(standalone):
    """A concrete admin route resolves to its own handler, not the catch-all.

    With no agent row seeded, ``/admin/api/v1/agent`` returns 404 via the
    real router's not-found path. The catch-all uses a distinctive
    ``"No admin API endpoint at ..."`` template, so asserting that string
    is absent fails iff the wildcard shadowed the concrete route.
    """
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/agent")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert "No admin API endpoint at" not in body["error"]["message"]
