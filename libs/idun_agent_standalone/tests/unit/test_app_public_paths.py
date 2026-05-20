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


@pytest.mark.parametrize(
    "path",
    [
        # List endpoint — the SPA's useChat fetches this on every chat
        # page load to render the history sidebar.
        "/agent/sessions",
        # Detail endpoint — useChat hydrates the active thread by id.
        # The path parameter is arbitrary user_id-scoped state, not an
        # admin handle.
        "/agent/sessions/abc-123",
        "/agent/sessions/12345678-90ab-4cde-9f01-234567890abc",
    ],
)
def test_chat_session_paths_are_public(path: str) -> None:
    """Chat-surface endpoints must be reachable under password mode.

    Without this, the SPA's `useChat` hits 401 on every page load and
    `apiFetch`'s global 401 handler hard-redirects the user to /login —
    even though the chat page itself is not gated. Per-user scoping of
    these endpoints is the engine's job (Step 2 of the SPEC); the gate
    must not pre-empt that.
    """
    assert _is_public_runtime_path(path) is True
