"""SES.2 — ADK adapter session history.

Exercises ``AdkAgent.history_capabilities``, ``list_sessions`` and
``get_session`` against ADK's ``InMemorySessionService``. These tests
construct a lightweight ``AdkAgent`` (no ``initialize()`` call) and
attach a fresh ``InMemorySessionService`` directly — no Vertex AI,
PostgreSQL, or LLM dependencies required.
"""

from __future__ import annotations

import asyncio

import pytest
from google.adk.events import Event
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part

from idun_agent_engine.agent.adk.adk import AdkAgent


def _make_user_event(text: str) -> Event:
    return Event(
        author="user",
        content=Content(role="user", parts=[Part(text=text)]),
        invocation_id=f"inv-user-{text}",
    )


def _make_assistant_event(text: str, author: str = "mock_agent") -> Event:
    return Event(
        author=author,
        content=Content(role="model", parts=[Part(text=text)]),
        invocation_id=f"inv-assist-{text}",
    )


def _make_tool_event(author: str = "mock_agent") -> Event:
    """Build an event with no text parts (mimics a tool call / empty response)."""
    return Event(
        author=author,
        content=Content(role="model", parts=[]),
        invocation_id="inv-tool",
    )


async def _adk_agent_with_seeded_sessions(
    *,
    app_name: str = "test-adk",
) -> tuple[AdkAgent, InMemorySessionService]:
    """Build an ``AdkAgent`` wired to a fresh ``InMemorySessionService``.

    Seeds three sessions so the test suite can cover sorting, scoping,
    and reconstruction without re-seeding inside each test:

    - ``s1`` for ``u1``: user "Hello" → assistant "Hi there!" → empty tool event
    - ``s2`` for ``u1``: user "Second one" (newer than s1)
    - ``s3`` for ``u2``: user "Other user"

    Each session's ``state`` carries ``_ag_ui_thread_id`` matching its
    ADK session id. In production ``ADKAGUIAgent`` seeds this key on
    every session it creates; the adapter's ``list_sessions`` /
    ``get_session`` use it as the canonical id (mirroring LangGraph
    where thread_id == session_id natively). The same-string convention
    keeps the rest of the test assertions readable.
    """
    svc = InMemorySessionService()

    s1 = await svc.create_session(
        app_name=app_name,
        user_id="u1",
        session_id="s1",
        state={"_ag_ui_thread_id": "s1"},
    )
    await svc.append_event(s1, _make_user_event("Hello"))
    await svc.append_event(s1, _make_assistant_event("Hi there!"))
    await svc.append_event(s1, _make_tool_event())

    # Sleep briefly so s2's last_update_time is strictly after s1's.
    await asyncio.sleep(0.05)
    s2 = await svc.create_session(
        app_name=app_name,
        user_id="u1",
        session_id="s2",
        state={"_ag_ui_thread_id": "s2"},
    )
    await svc.append_event(s2, _make_user_event("Second one"))

    await asyncio.sleep(0.05)
    s3 = await svc.create_session(
        app_name=app_name,
        user_id="u2",
        session_id="s3",
        state={"_ag_ui_thread_id": "s3"},
    )
    await svc.append_event(s3, _make_user_event("Other user"))

    agent = AdkAgent()
    agent._session_service = svc
    agent._name = app_name
    return agent, svc


@pytest.mark.asyncio
async def test_adk_history_capabilities_true_when_session_service_set() -> None:
    """Adapter advertises list+get support whenever a session service is wired."""
    agent = AdkAgent()
    # Fresh AdkAgent has _session_service = None until initialize() runs.
    caps_off = agent.history_capabilities()
    assert caps_off.can_list is False
    assert caps_off.can_get is False

    agent._session_service = InMemorySessionService()
    caps_on = agent.history_capabilities()
    assert caps_on.can_list is True
    assert caps_on.can_get is True


@pytest.mark.asyncio
async def test_adk_list_sessions_returns_sorted_with_preview() -> None:
    """Two u1 sessions → list returns both, newest first, with previews."""
    agent, _svc = await _adk_agent_with_seeded_sessions()

    summaries = await agent.list_sessions(user_id="u1")

    assert [s.id for s in summaries] == [
        "s2",
        "s1",
    ], "expected newest session (s2) to be listed first"
    # Both summaries belong to u1.
    assert all(s.user_id == "u1" for s in summaries)
    # Strictly descending update times.
    assert summaries[0].last_update_time is not None
    assert summaries[1].last_update_time is not None
    assert summaries[0].last_update_time > summaries[1].last_update_time

    # Previews come from the FIRST user-authored text in each session.
    by_id = {s.id: s for s in summaries}
    assert by_id["s1"].preview == "Hello"
    assert by_id["s2"].preview == "Second one"

    # Fixture seeds _ag_ui_thread_id matching the ADK session id, mirroring
    # the production ADKAGUIAgent flow.
    assert by_id["s1"].thread_id == "s1"
    assert by_id["s2"].thread_id == "s2"


@pytest.mark.asyncio
async def test_adk_list_sessions_scopes_by_user() -> None:
    """list_sessions(u1) returns only u1's; list(u2) returns only u2's."""
    agent, _svc = await _adk_agent_with_seeded_sessions()

    u1 = await agent.list_sessions(user_id="u1")
    u2 = await agent.list_sessions(user_id="u2")

    assert sorted(s.id for s in u1) == ["s1", "s2"]
    assert [s.id for s in u2] == ["s3"]
    assert u2[0].user_id == "u2"


@pytest.mark.asyncio
async def test_adk_list_sessions_default_anonymous_user_is_empty() -> None:
    """When no user_id is provided the adapter scopes to 'anonymous'.

    Our seed data only has u1 / u2, so the result must be empty (vs.
    leaking other users' sessions).
    """
    agent, _svc = await _adk_agent_with_seeded_sessions()

    summaries = await agent.list_sessions()
    assert summaries == []


@pytest.mark.asyncio
async def test_adk_get_session_reconstructs_text_messages() -> None:
    """User text + assistant text + empty tool event → only the two text msgs."""
    agent, _svc = await _adk_agent_with_seeded_sessions()

    detail = await agent.get_session("s1", user_id="u1")

    assert detail is not None
    assert detail.id == "s1"
    assert detail.user_id == "u1"
    # The empty tool event must be dropped per spec §5.
    assert len(detail.messages) == 2
    assert [m.role for m in detail.messages] == ["user", "assistant"]
    assert detail.messages[0].content == "Hello"
    assert detail.messages[1].content == "Hi there!"
    # Each message gets a deterministic id from the underlying event.
    assert detail.messages[0].id
    assert detail.messages[1].id


@pytest.mark.asyncio
async def test_adk_get_session_propagates_thread_id_from_state() -> None:
    """``state['_ag_ui_thread_id']`` flows through to ``SessionDetail.thread_id``.

    Routes call ``agent.get_session(<id from listing>, ...)``. Since
    ``list_sessions`` returns the AG-UI thread_id as the canonical id,
    the lookup arg is the thread_id — NOT ADK's internal session_id.
    """
    svc = InMemorySessionService()
    await svc.create_session(
        app_name="test-adk",
        user_id="u1",
        session_id="threaded",  # ADK's internal id, opaque to the route layer
        state={"_ag_ui_thread_id": "thread-abc"},
    )

    agent = AdkAgent()
    agent._session_service = svc
    agent._name = "test-adk"

    detail = await agent.get_session("thread-abc", user_id="u1")
    assert detail is not None
    assert detail.thread_id == "thread-abc"


@pytest.mark.asyncio
async def test_adk_get_session_missing_returns_none() -> None:
    """Unknown session id → None (404 at the route layer)."""
    agent, _svc = await _adk_agent_with_seeded_sessions()

    assert await agent.get_session("does-not-exist", user_id="u1") is None


@pytest.mark.asyncio
async def test_adk_get_session_cross_user_returns_none() -> None:
    """get_session(s1 owned by u1, user_id='u2') → None."""
    agent, svc = await _adk_agent_with_seeded_sessions()

    # Sanity: u1 can fetch s1.
    assert (await agent.get_session("s1", user_id="u1")) is not None

    # Cross-user: u2 must NOT see s1, even if the underlying service
    # were tricked into returning it. Confirm the guard fires.
    cross = await agent.get_session("s1", user_id="u2")
    assert cross is None
    # Sanity: the session still exists in the backing service.
    raw = await svc.get_session(app_name="test-adk", user_id="u1", session_id="s1")
    assert raw is not None


@pytest.mark.asyncio
async def test_adk_list_sessions_no_session_service_returns_empty() -> None:
    """No backing session service → empty list (not an exception)."""
    agent = AdkAgent()
    assert agent._session_service is None
    assert await agent.list_sessions(user_id="u1") == []


@pytest.mark.asyncio
async def test_adk_get_session_no_session_service_returns_none() -> None:
    """No backing session service → None (not an exception)."""
    agent = AdkAgent()
    assert agent._session_service is None
    assert await agent.get_session("anything", user_id="u1") is None
