from __future__ import annotations

from pathlib import Path

from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import _resolve_ui_dir
from idun_agent_standalone.core.settings import StandaloneSettings


async def test_unconfigured_boot_uses_engine_app_title(standalone):
    """No-agent boot now goes through ``create_engine_app`` so the wizard
    can materialize without a process restart. The engine factory sets
    its own title — there is no separate "admin only" app any more.
    """
    assert standalone.title == "Idun Agent Engine Server"


async def test_agent_routes_return_503_when_unconfigured(standalone):
    """``/agent/*`` is registered unconditionally; ``get_agent`` gates
    on ``app.state.agent`` and returns 503 ``agent_not_ready`` until
    ``configure_app`` runs (i.e. the wizard materializes an agent).
    """
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/agent/capabilities")
    assert response.status_code == 503


async def test_admin_api_reachable_when_unconfigured(standalone):
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
