from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from idun_agent_standalone.app import create_standalone_app
from idun_agent_standalone.core.settings import AuthMode, StandaloneSettings
from idun_agent_standalone.db.migrate import upgrade_head

_PREFIX = "window.__IDUN_CONFIG__ = "
_SUFFIX = ";\n"


def _parse_runtime_config(body: str) -> dict:
    assert body.startswith(_PREFIX)
    assert body.endswith(_SUFFIX)
    return json.loads(body[len(_PREFIX) : -len(_SUFFIX)])


@pytest.fixture
async def standalone_telemetry_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[FastAPI]:
    db_path = tmp_path / "standalone.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    await asyncio.to_thread(upgrade_head)
    monkeypatch.setenv("IDUN_ADMIN_AUTH_MODE", AuthMode.NONE.value)
    monkeypatch.setenv("IDUN_TELEMETRY_ENABLED", "false")
    settings = StandaloneSettings()
    app = await create_standalone_app(settings)
    try:
        yield app
    finally:
        await app.state.db_engine.dispose()


async def test_runtime_config_headers(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/runtime-config.js")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/javascript")
    assert response.headers["cache-control"] == "no-store"


async def test_runtime_config_body_shape(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/runtime-config.js")
    config = _parse_runtime_config(response.text)
    assert set(config) == {
        "theme",
        "authMode",
        "layout",
        "agentReady",
        "bootFailed",
        "telemetry",
    }
    assert config["authMode"] == "none"


async def test_runtime_config_reflects_password_mode(standalone_password):
    transport = ASGITransport(app=standalone_password)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/runtime-config.js")
    config = _parse_runtime_config(response.text)
    assert config["authMode"] == "password"


async def test_runtime_config_theme_has_color_schemes(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/runtime-config.js")
    config = _parse_runtime_config(response.text)
    theme = config["theme"]
    assert "colors" in theme
    assert {"light", "dark"}.issubset(theme["colors"])


async def test_runtime_config_includes_telemetry_block(standalone):
    transport = ASGITransport(app=standalone)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/runtime-config.js")
    config = _parse_runtime_config(response.text)
    telemetry = config["telemetry"]
    assert telemetry["enabled"] is True
    assert telemetry["host"] == "https://us.i.posthog.com"
    assert telemetry["projectKey"].startswith("phc_")
    assert telemetry["deploymentType"] == "self-hosted"
    assert telemetry["identifyUsers"] is True
    assert telemetry["sessionReplay"] is True


async def test_runtime_config_honors_disabled_telemetry(standalone_telemetry_disabled):
    transport = ASGITransport(app=standalone_telemetry_disabled)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/runtime-config.js")
    config = _parse_runtime_config(response.text)
    assert config["telemetry"]["enabled"] is False
