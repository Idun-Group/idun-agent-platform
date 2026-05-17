from __future__ import annotations

import pytest
from idun_agent_standalone.app import _is_public_runtime_path


@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/health",
        "/runtime-config.js",
        "/agent/run",
        "/agent/stream",
        "/agent/copilotkit/stream",
        "/agent/invoke",
        "/agent/capabilities",
        "/admin/api/v1/auth/login",
        "/admin/api/v1/auth/logout",
        "/admin/api/v1/auth/me",
        "/admin/api/v1/auth/change-password",
        "/admin",
        "/admin/dashboard",
        "/admin/agents/new",
        "/login",
        "/login/sso",
        "/_next/static/chunk.js",
        "/some/random/spa/route",
    ],
)
def test_public_paths_bypass_gate(path: str) -> None:
    assert _is_public_runtime_path(path) is True


@pytest.mark.parametrize(
    "path",
    [
        "/admin/api/v1/agent",
        "/admin/api/v1/memory",
        "/admin/api/v1/guardrails",
        "/admin/api/anything-else",
        "/agent/something-not-listed",
        "/_engine/health",
        "/_engine/whatever",
        "/reload",
    ],
)
def test_private_paths_require_auth(path: str) -> None:
    assert _is_public_runtime_path(path) is False
