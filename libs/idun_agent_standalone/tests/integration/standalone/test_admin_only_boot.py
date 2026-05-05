from __future__ import annotations

from pathlib import Path

from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import _resolve_ui_dir
from idun_agent_standalone.core.settings import StandaloneSettings


async def test_admin_only_title_when_no_agent_row(standalone):
    assert standalone.title == "Idun Agent Standalone (admin only)"


async def test_engine_routes_not_mounted_in_admin_only_mode(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/agent/capabilities")
    assert response.status_code in (404, 405)


async def test_admin_api_reachable_in_admin_only_mode(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin/api/v1/auth/me")
    assert response.status_code == 200


def test_resolve_ui_dir_returns_env_path_when_index_present(tmp_path: Path):
    candidate = tmp_path / "ui"
    candidate.mkdir()
    (candidate / "index.html").write_text("<html></html>")
    settings = StandaloneSettings(IDUN_UI_DIR=candidate)
    assert _resolve_ui_dir(settings) == candidate


def test_resolve_ui_dir_falls_back_when_env_path_lacks_index(tmp_path: Path):
    candidate = tmp_path / "ui"
    candidate.mkdir()
    settings = StandaloneSettings(IDUN_UI_DIR=candidate)
    result = _resolve_ui_dir(settings)
    assert result != candidate


def test_resolve_ui_dir_falls_back_when_env_path_missing(tmp_path: Path):
    missing = tmp_path / "does-not-exist"
    settings = StandaloneSettings(IDUN_UI_DIR=missing)
    result = _resolve_ui_dir(settings)
    assert result != missing
