from __future__ import annotations

import json

from httpx import ASGITransport, AsyncClient

_PREFIX = "window.__IDUN_CONFIG__ = "
_SUFFIX = ";\n"


def _parse_runtime_config(body: str) -> dict:
    assert body.startswith(_PREFIX)
    assert body.endswith(_SUFFIX)
    return json.loads(body[len(_PREFIX) : -len(_SUFFIX)])


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
    assert set(config) == {"theme", "authMode", "layout"}
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
