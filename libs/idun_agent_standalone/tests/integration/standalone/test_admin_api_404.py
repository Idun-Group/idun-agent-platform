"""Unmapped paths under ``/admin/api/`` must return a JSON 404 envelope.

Without an explicit catch-all, ``StaticFiles(directory=ui_dir, html=True)``
mounted at ``/`` falls back to ``index.html`` for paths it doesn't know
about — so probes against ``/admin/api/v1/<typo>`` would see the chat UI
HTML bundle instead of a structured 404. That masks routing misses as
"page exists, blank" and trips OpenAPI clients, curl debugging, and any
caller doing ``JSON.parse`` on the response.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.db.migrate import upgrade_head


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


async def test_admin_spa_still_serves_html(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """``/admin/`` (the SPA root) is not shadowed by the API catch-all.

    Provisions a stub ``index.html`` and points ``IDUN_UI_DIR`` at it so
    ``_resolve_ui_dir`` returns a real directory and ``StaticFiles`` is
    mounted at ``/`` (matching production, where the wheel ships with a
    bundled SPA). Without this stub, clean CI has no built UI and the
    test would only exercise the unmounted-static path, never proving
    the catch-all leaves the SPA root reachable.
    """
    db_path = tmp_path / "standalone.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    await asyncio.to_thread(upgrade_head)
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", AuthMode.NONE.value)

    ui_dir = tmp_path / "ui"
    ui_dir.mkdir()
    (ui_dir / "index.html").write_text("<!doctype html><title>stub</title>")
    # StaticFiles(html=True) maps /admin/ to <ui_dir>/admin/index.html — the
    # bundled Next.js export ships a per-route index.html; mirror that here.
    (ui_dir / "admin").mkdir()
    (ui_dir / "admin" / "index.html").write_text(
        "<!doctype html><title>admin</title>"
    )
    monkeypatch.setenv("IDUN_UI_DIR", str(ui_dir))

    settings = StandaloneSettings()
    app = await create_standalone_app(settings)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/admin/")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
    finally:
        await app.state.db_engine.dispose()


async def test_unmapped_admin_api_under_password_mode_requires_auth(
    standalone_password,
):
    """Unauth probes can't tell mapped from unmapped admin paths.

    Regression for the route-enumeration leak: if the catch-all skipped
    ``require_auth``, an unauthenticated caller would see ``401`` for
    every real admin route and ``404`` for unmapped ones, mapping the
    REST surface without credentials. Both must return ``401``.
    """
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        real = await client.get("/admin/api/v1/agent")
        unmapped = await client.get("/admin/api/v1/nonexistent")
    assert real.status_code == 401
    assert unmapped.status_code == 401


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
