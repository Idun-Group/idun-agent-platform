"""Tests for `/agent/sessions` user_id propagation.

Today the route resolves a user_id and passes it to the adapter as a
kwarg, but does NOT bind ``current_user_id`` ContextVar. That worked
when only ADK consumed the kwarg. With Step 2 the LangGraph adapter
will scope checkpoint metadata via the ContextVar (since the adapter's
runtime path doesn't carry the user_id as a kwarg), so the route must
bind both consistently.

Each test pins a concrete failure mode:
  * route forwards the resolved user_id as the kwarg (today's contract),
  * route ALSO binds ``current_user_id`` to that same value while the
    adapter call is in flight (new behavior),
  * the two values agree — if they drift, scoping silently splits across
    the two propagation channels.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from idun_agent_schema.engine.sessions import HistoryCapabilities, SessionDetail

from idun_agent_engine.identity import current_user_id
from idun_agent_engine.server.auth import get_verified_user
from idun_agent_engine.server.dependencies import get_agent
from idun_agent_engine.server.routers.agent import agent_router

pytestmark = pytest.mark.unit


def _build_app(fake_agent) -> FastAPI:
    app = FastAPI()
    app.include_router(agent_router, prefix="/agent")
    app.state.sso_validator = None
    app.dependency_overrides[get_verified_user] = lambda: None
    app.dependency_overrides[get_agent] = lambda: fake_agent
    return app


class _CapturingAgent:
    """Mock adapter that records both the kwarg and the ContextVar value
    seen during the adapter call."""

    agent_type = "fake"

    def __init__(self) -> None:
        self.captured: dict[str, object] = {}

    def history_capabilities(self) -> HistoryCapabilities:
        return HistoryCapabilities(can_list=True, can_get=True)

    async def list_sessions(self, *, user_id: str | None = None):
        self.captured["list_kwarg"] = user_id
        self.captured["list_ctxvar"] = current_user_id.get()
        return []

    async def get_session(self, session_id: str, *, user_id: str | None = None):
        self.captured["get_kwarg"] = user_id
        self.captured["get_ctxvar"] = current_user_id.get()
        return SessionDetail(
            id=session_id,
            last_update_time=0.0,
            user_id=user_id,
            thread_id=session_id,
            messages=[],
        )


def test_list_sessions_binds_contextvar_to_resolved_user_id():
    """When `/agent/sessions` is called with an X-Idun-User-Id header,
    the ContextVar must hold that value during the adapter call. Without
    this, LangGraph adapter code in Step 2 that reads the ContextVar to
    stamp checkpoint metadata sees the default ``"standalone"`` and
    every visitor's threads collide on the same logical user."""
    agent = _CapturingAgent()
    app = _build_app(agent)
    with TestClient(app) as client:
        resp = client.get("/agent/sessions", headers={"X-Idun-User-Id": "alice"})
    assert resp.status_code == 200
    assert agent.captured["list_kwarg"] == "alice"
    assert agent.captured["list_ctxvar"] == "alice"


def test_get_session_binds_contextvar_to_resolved_user_id():
    """Same contract as list_sessions for the detail route."""
    agent = _CapturingAgent()
    app = _build_app(agent)
    with TestClient(app) as client:
        resp = client.get(
            "/agent/sessions/t-1", headers={"X-Idun-User-Id": "bob"}
        )
    assert resp.status_code == 200
    assert agent.captured["get_kwarg"] == "bob"
    assert agent.captured["get_ctxvar"] == "bob"


def test_kwarg_and_contextvar_never_disagree():
    """The kwarg and the ContextVar are two propagation channels for
    the same value. If they drift, half the adapter scoping uses one
    user_id and half the other. Pin equality explicitly."""
    agent = _CapturingAgent()
    app = _build_app(agent)
    with TestClient(app) as client:
        client.get("/agent/sessions", headers={"X-Idun-User-Id": "alice"})
        client.get(
            "/agent/sessions/t-1", headers={"X-Idun-User-Id": "alice"}
        )
    assert agent.captured["list_kwarg"] == agent.captured["list_ctxvar"]
    assert agent.captured["get_kwarg"] == agent.captured["get_ctxvar"]


def test_anonymous_request_gets_uuid_in_both_channels():
    """When no SSO and no header are sent, the route mints a uuid (per
    `_resolve_user_id`) and propagates it to BOTH channels. Anonymous
    visitors get an isolated identity, not the shared ``"standalone"``
    default."""
    agent = _CapturingAgent()
    app = _build_app(agent)
    with TestClient(app) as client:
        resp = client.get("/agent/sessions")
    assert resp.status_code == 200
    # uuid4().hex is 32 lowercase hex chars; the exact value differs per
    # request, but the kwarg and ctxvar must match each other and must
    # not be the contextvar default.
    kwarg = agent.captured["list_kwarg"]
    ctxvar = agent.captured["list_ctxvar"]
    assert isinstance(kwarg, str) and len(kwarg) == 32
    assert kwarg == ctxvar
    assert kwarg != "standalone"
