"""Tests for `/runtime-config.js` bootstrap payload.

The SPA reads `window.__IDUN_CONFIG__` synchronously before hydration to
decide whether to redirect first-run users to `/onboarding`. The signal
lives here (and not in `/health` or a dedicated endpoint) because:

  * bootstrap data already arrives on this script; one fewer fetch,
  * setup state is page-lifetime, matching the bootstrap layer,
  * `/health` is a liveness probe; overloading it ties UX routing to
    probe-shape changes.

Each test pins a concrete signal the SPA depends on.
"""

from __future__ import annotations

import json
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient
from idun_agent_standalone.core.settings import StandaloneSettings
from idun_agent_standalone.runtime_config import router as runtime_config_router


def _settings() -> StandaloneSettings:
    """Minimal valid settings; auth_mode is irrelevant to the payload
    fields under test."""
    return StandaloneSettings(
        IDUN_ADMIN_AUTH_MODE="none",  # type: ignore[call-arg]
    )


def _build_app(*, agent: object | None, boot_error: str | None = None) -> FastAPI:
    app = FastAPI()
    app.include_router(runtime_config_router)
    app.state.settings = _settings()
    app.state.agent = agent
    if boot_error is not None:
        app.state.boot_error = boot_error
    return app


def _parse_config(body: str) -> dict:
    """Extract the JSON dict from `window.__IDUN_CONFIG__ = {...};`."""
    match = re.search(r"window\.__IDUN_CONFIG__\s*=\s*({.*});", body, re.DOTALL)
    assert match, f"unexpected bootstrap shape: {body!r}"
    return json.loads(match.group(1))


def test_agent_ready_true_when_agent_attached():
    """When the standalone has materialized an agent, the SPA must
    render chat immediately. `agentReady=true` is the signal."""
    app = _build_app(agent=object())
    with TestClient(app) as client:
        body = client.get("/runtime-config.js").text
    config = _parse_config(body)
    assert config["agentReady"] is True
    assert config["bootFailed"] is False


def test_agent_ready_false_when_no_agent_attached():
    """Fresh install: no agent row in DB, engine boots without one.
    `agentReady=false` triggers the SPA's redirect to /onboarding."""
    app = _build_app(agent=None)
    with TestClient(app) as client:
        body = client.get("/runtime-config.js").text
    config = _parse_config(body)
    assert config["agentReady"] is False
    assert config["bootFailed"] is False


def test_boot_failed_true_on_assembly_error():
    """Broken deploy: assembly failed. SPA must NOT redirect to
    /onboarding (wizard can't help); render chat so the eventual 503
    reaches the user. `bootFailed=true` is the signal."""
    app = _build_app(agent=None, boot_error="Agent assembly failed: bad YAML")
    with TestClient(app) as client:
        body = client.get("/runtime-config.js").text
    config = _parse_config(body)
    assert config["agentReady"] is False
    assert config["bootFailed"] is True


def test_boot_failed_does_not_leak_exception_details():
    """Information-disclosure guard: the public endpoint must not echo
    raw exception text (DB URIs, file paths, parse traces). The boolean
    signal is sufficient for the SPA's routing decision."""
    sensitive = (
        "Agent assembly failed: postgresql://idun:hunter2@10.0.0.1:5432/prod"
    )
    app = _build_app(agent=None, boot_error=sensitive)
    with TestClient(app) as client:
        body = client.get("/runtime-config.js").text
    assert sensitive not in body
    assert "hunter2" not in body
    assert "10.0.0.1" not in body


def test_response_is_javascript_no_store():
    """Bootstrap script is per-page and may differ per deploy. Cache
    headers must keep proxies from serving a stale `agentReady` value
    after the operator runs onboarding."""
    app = _build_app(agent=object())
    with TestClient(app) as client:
        resp = client.get("/runtime-config.js")
    assert resp.headers["content-type"].startswith("application/javascript")
    assert resp.headers["cache-control"] == "no-store"
