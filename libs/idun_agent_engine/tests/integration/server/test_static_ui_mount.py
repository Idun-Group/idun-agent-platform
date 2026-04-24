"""Integration tests for the IDUN_UI_DIR static UI mount.

The engine serves a JSON info payload at ``/`` by default. When
``IDUN_UI_DIR`` is set to a directory containing static assets, the engine
mounts those files at ``/`` and the JSON payload remains reachable at
``/_engine/info``.

These tests rely on the ``echo_agent_config`` fixture from
``idun_agent_standalone.testing`` (Task 1.5). Until that package exists they
are SKIPPED — but the file must collect cleanly.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from idun_agent_engine import create_app


@pytest.mark.asyncio
async def test_root_serves_info_when_no_ui_dir(monkeypatch, echo_agent_config):
    monkeypatch.delenv("IDUN_UI_DIR", raising=False)
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.get("/")
        assert r.status_code == 200
        assert "application/json" in r.headers["content-type"]
        info = await c.get("/_engine/info")
        assert info.status_code == 200
        assert "application/json" in info.headers["content-type"]


@pytest.mark.asyncio
async def test_root_serves_static_index_when_ui_dir_set(
    monkeypatch, tmp_path, echo_agent_config
):
    (tmp_path / "index.html").write_text("<!doctype html><title>TEST</title>")
    monkeypatch.setenv("IDUN_UI_DIR", str(tmp_path))
    app = create_app(config_dict=echo_agent_config)

    async with app.router.lifespan_context(app), AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.get("/")
        assert r.status_code == 200
        assert "TEST" in r.text

        info = await c.get("/_engine/info")
        assert info.status_code == 200
        assert "application/json" in info.headers["content-type"]
