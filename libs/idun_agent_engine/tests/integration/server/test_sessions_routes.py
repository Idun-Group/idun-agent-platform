"""SES.4 — `/agent/sessions` and `/agent/sessions/{id}` route integration.

Boots the engine with an in-memory echo LangGraph agent (via the
``echo_agent_config`` fixture from ``idun_agent_standalone.testing``),
seeds threads by calling ``ainvoke`` directly on the compiled graph, and
exercises the new HTTP endpoints. Also covers the 501 path via a stub
agent without history support and a smoke test for camelCase aliases on
``GET /agent/capabilities``.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from langchain_core.messages import HumanMessage

from idun_agent_engine import create_app

# -----------------------------------------------------------------------------
# /agent/sessions — happy path against the echo LangGraph agent
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sessions_returns_seeded_threads(echo_agent_config):
    """After seeding two threads, ``GET /agent/sessions`` lists both.

    Drives the lifespan via ``app.router.lifespan_context`` so the agent
    is wired onto ``app.state`` before the HTTP request — same pattern as
    the existing run-event observer tests.
    """
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        agent = app.state.agent
        graph = agent._agent_instance
        await graph.ainvoke(
            {"messages": [HumanMessage(content="hi from t1")]},
            {"configurable": {"thread_id": "t1"}},
        )
        await graph.ainvoke(
            {"messages": [HumanMessage(content="hi from t2")]},
            {"configurable": {"thread_id": "t2"}},
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get("/agent/sessions")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert isinstance(body, list)
        ids = {row["id"] for row in body}
        assert ids == {"t1", "t2"}
        # camelCase aliases (lastUpdateTime / threadId) per to_camel.
        sample = next(row for row in body if row["id"] == "t1")
        assert "lastUpdateTime" in sample
        assert sample["threadId"] == "t1"
        assert sample["preview"] == "hi from t1"


@pytest.mark.asyncio
async def test_get_session_returns_messages_for_known_thread(echo_agent_config):
    """``GET /agent/sessions/{id}`` returns the reconstructed transcript."""
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        agent = app.state.agent
        graph = agent._agent_instance
        await graph.ainvoke(
            {"messages": [HumanMessage(content="hello world")]},
            {"configurable": {"thread_id": "thread-A"}},
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get("/agent/sessions/thread-A")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == "thread-A"
        assert body["threadId"] == "thread-A"
        roles = [m["role"] for m in body["messages"]]
        assert roles == ["user", "assistant"]
        contents = [m["content"] for m in body["messages"]]
        assert contents[0] == "hello world"
        assert contents[1] == "echo: hello world"


@pytest.mark.asyncio
async def test_get_session_returns_404_for_unknown_thread(echo_agent_config):
    """Unknown ids produce 404, never 500."""
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get("/agent/sessions/never-seeded")
        assert resp.status_code == 404


# -----------------------------------------------------------------------------
# /agent/capabilities — confirms history.canList / history.canGet surface
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_capabilities_exposes_history_aliases(echo_agent_config):
    """The cached capabilities payload uses camelCase aliases for history."""
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get("/agent/capabilities")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        history = body.get("history")
        assert history is not None, body
        # Pydantic returns aliases by default — see HistoryCapabilities.
        assert history["canList"] is True
        assert history["canGet"] is True


# -----------------------------------------------------------------------------
# 501 path — stub agent without history support
# -----------------------------------------------------------------------------


def _install_stub_agent(app, agent_type: str = "Stub") -> None:
    """Replace the live agent with a stub whose history caps default to False.

    Mimics the public surface of an adapter that doesn't override
    ``history_capabilities``: ``BaseAgent`` returns ``can_list=False,
    can_get=False`` by default (see SES.1).
    """
    from idun_agent_schema.engine.sessions import HistoryCapabilities

    stub = MagicMock()
    stub.history_capabilities = MagicMock(
        return_value=HistoryCapabilities(can_list=False, can_get=False)
    )
    stub.list_sessions = AsyncMock()
    stub.get_session = AsyncMock()
    # The route reads `agent.agent_type` for the 501 detail payload.
    type(stub).agent_type = property(lambda self: agent_type)  # type: ignore[assignment]
    app.state.agent = stub


@pytest.mark.asyncio
async def test_list_sessions_returns_501_when_history_unsupported(echo_agent_config):
    """Adapter without history support returns 501 with `agent_type`."""
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        _install_stub_agent(app, agent_type="Haystack")
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get("/agent/sessions")
        assert resp.status_code == 501, resp.text
        body = resp.json()
        assert body["detail"]["agent_type"] == "Haystack"
        assert "listing" in body["detail"]["error"].lower()


@pytest.mark.asyncio
async def test_get_session_returns_501_when_history_unsupported(echo_agent_config):
    """Detail endpoint mirrors the 501 contract for unsupported adapters."""
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        _install_stub_agent(app, agent_type="Haystack")
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get("/agent/sessions/anything")
        assert resp.status_code == 501, resp.text
        body = resp.json()
        assert body["detail"]["agent_type"] == "Haystack"


# -----------------------------------------------------------------------------
# SSO scoping — when a validator is wired, the route forwards user.email
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sessions_forwards_email_when_sso_enabled(echo_agent_config):
    """SSO claims propagate to the adapter as the ``user_id`` argument.

    Mocks ``app.state.sso_validator`` so ``get_verified_user`` resolves a
    valid bearer to a real claims dict — the route extracts ``email`` and
    hands it to ``agent.list_sessions``.
    """
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        validator = MagicMock()
        validator.validate_token = AsyncMock(
            return_value={"sub": "u1", "email": "alice@company.com"}
        )
        app.state.sso_validator = validator

        captured: dict[str, Any] = {}
        agent = app.state.agent
        original = agent.list_sessions

        async def _spy(*, user_id: str | None = None):
            captured["user_id"] = user_id
            return await original(user_id=user_id)

        agent.list_sessions = _spy  # type: ignore[method-assign]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get(
                "/agent/sessions",
                headers={"Authorization": "Bearer good-token"},
            )

        assert resp.status_code == 200, resp.text
        assert captured["user_id"] == "alice@company.com"


@pytest.mark.asyncio
async def test_list_sessions_returns_401_when_sso_token_missing(echo_agent_config):
    """When SSO is wired but the request is unauthenticated, get 401."""
    app = create_app(config_dict=echo_agent_config)
    async with app.router.lifespan_context(app):
        # validator presence alone causes get_verified_user to require a bearer.
        app.state.sso_validator = MagicMock()
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://t",
        ) as client:
            resp = await client.get("/agent/sessions")
        assert resp.status_code == 401
