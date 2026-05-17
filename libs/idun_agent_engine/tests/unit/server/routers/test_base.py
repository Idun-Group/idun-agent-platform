"""Unit tests for the base router — covers /health agent-ready signaling.

Origin: FIX 02 in idun-dev/tasks/before-release-11-05-2026/02-health-agent-ready/.
Finding L10-1: /health returned status=ok even when the engine booted in
admin-only mode and every /agent/* call returned 503. The only signal was
agent_name=null. These tests pin the explicit agent_ready: bool + degraded
status contract so monitoring probes can detect the broken state.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from idun_agent_engine.server.routers.base import base_router


def _build_app(
    *,
    agent: object | None = None,
    boot_error: str | None = None,
) -> FastAPI:
    app = FastAPI()
    app.include_router(base_router)
    app.state.agent = agent
    if boot_error is not None:
        app.state.boot_error = boot_error
    return app


class _Agent:
    """Minimal stand-in for a configured agent on app.state."""

    def __init__(self, name: str) -> None:
        self.configuration = type("Configuration", (), {"name": name})()


@pytest.fixture
def app_without_agent() -> FastAPI:
    """Engine booted but no agent was configured — admin-only/wizard state."""
    return _build_app(agent=None)


@pytest.fixture
def app_with_configured_agent() -> FastAPI:
    """Engine booted with an agent registered on app.state — happy path."""
    return _build_app(agent=_Agent(name="demo-agent"))


@pytest.fixture
def app_with_boot_error() -> FastAPI:
    """Standalone assembly failed; FIX 03 surfaces the reason on app.state."""
    return _build_app(
        agent=None,
        boot_error="Guardrail conversion failed: GUARDRAILS_API_KEY missing",
    )


def test_health_reports_degraded_when_no_agent(app_without_agent: FastAPI) -> None:
    """L10-1 regression: /health must NOT claim 'ok' while /agent/* will 503.

    This was the headline finding of the demo-idun-engine L10 postmortem:
    operators saw status=ok on a service whose /agent/* was wedged at 503.
    """
    client = TestClient(app_without_agent)

    resp = client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["agent_ready"] is False
    assert body["agent_name"] is None


def test_health_reports_ok_when_agent_configured(
    app_with_configured_agent: FastAPI,
) -> None:
    """Happy path: a registered agent flips status=ok and surfaces its name."""
    client = TestClient(app_with_configured_agent)

    resp = client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["agent_ready"] is True
    assert body["agent_name"] == "demo-agent"
    # `reason` is only present in degraded responses.
    assert "reason" not in body


def test_health_surfaces_boot_error_as_reason(app_with_boot_error: FastAPI) -> None:
    """When the standalone records why assembly failed, /health echoes it."""
    client = TestClient(app_with_boot_error)

    resp = client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["agent_ready"] is False
    assert "guardrail" in body["reason"].lower()
