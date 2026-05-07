"""SES.3 — LangGraph adapter session history.

Exercises ``LanggraphAgent.history_capabilities``, ``list_sessions`` and
``get_session`` against ``InMemorySaver`` and ``AsyncSqliteSaver``. Tests
construct a lightweight ``LanggraphAgent`` (no ``initialize()`` call) and
attach a freshly compiled echo graph + saver directly — no real LLM, no
manager, no observability stack.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import aiosqlite
import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, MessagesState, StateGraph

from idun_agent_engine.agent.langgraph.langgraph import (
    LanggraphAgent,
    _lc_messages_to_session,
)


def _echo_node(state: MessagesState) -> dict[str, Any]:
    """One-shot node: append a fixed assistant reply.

    Lets us seed real LangChain messages into the checkpointer without
    pulling in a model client.
    """
    last = state["messages"][-1]
    user_text = getattr(last, "content", "")
    if not isinstance(user_text, str):
        user_text = str(user_text)
    return {"messages": [AIMessage(content=f"echo: {user_text}")]}


def _build_graph() -> StateGraph:
    builder: StateGraph = StateGraph(MessagesState)
    builder.add_node("echo", _echo_node)
    builder.add_edge(START, "echo")
    builder.add_edge("echo", END)
    return builder


async def _make_agent_with_saver(saver: Any) -> LanggraphAgent:
    """Compile the echo graph against ``saver`` and wire it into a LanggraphAgent."""
    graph = _build_graph().compile(checkpointer=saver)
    agent = LanggraphAgent()
    agent._checkpointer = saver
    agent._agent_instance = graph
    agent._name = "test-langgraph-sessions"
    return agent


async def _seed_thread(agent: LanggraphAgent, thread_id: str, prompt: str) -> None:
    """Run the compiled graph once for ``thread_id`` to populate the checkpointer."""
    await agent._agent_instance.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        {"configurable": {"thread_id": thread_id}},
    )


async def _aclose_sqlite_saver(saver: AsyncSqliteSaver, conn: aiosqlite.Connection) -> None:
    await conn.close()


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
async def inmemory_agent() -> AsyncIterator[LanggraphAgent]:
    saver = InMemorySaver()
    agent = await _make_agent_with_saver(saver)
    yield agent


@pytest.fixture
async def sqlite_saver(tmp_path) -> AsyncIterator[AsyncSqliteSaver]:
    db_path = tmp_path / "ses3.db"
    conn = await aiosqlite.connect(str(db_path))
    saver = AsyncSqliteSaver(conn=conn)
    await saver.setup()
    try:
        yield saver
    finally:
        await conn.close()


# -----------------------------------------------------------------------------
# history_capabilities
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_capabilities_false_without_checkpointer():
    agent = LanggraphAgent()
    caps = agent.history_capabilities()
    assert caps.can_list is False
    assert caps.can_get is False


@pytest.mark.asyncio
async def test_history_capabilities_true_with_inmemory_saver(inmemory_agent):
    caps = inmemory_agent.history_capabilities()
    assert caps.can_list is True
    assert caps.can_get is True


# -----------------------------------------------------------------------------
# list_sessions / get_session — InMemorySaver
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sessions_returns_two_threads_with_inmemory(inmemory_agent):
    await _seed_thread(inmemory_agent, "t1", "first thread prompt")
    await _seed_thread(inmemory_agent, "t2", "second thread prompt")

    sessions = await inmemory_agent.list_sessions()

    ids = {s.id for s in sessions}
    assert ids == {"t1", "t2"}

    by_id = {s.id: s for s in sessions}
    assert by_id["t1"].thread_id == "t1"
    assert by_id["t1"].user_id is None
    # Preview should be the first user-authored message text.
    assert by_id["t1"].preview == "first thread prompt"
    assert by_id["t2"].preview == "second thread prompt"


@pytest.mark.asyncio
async def test_get_session_reconstructs_messages_from_state(inmemory_agent):
    await _seed_thread(inmemory_agent, "t-detail", "hello world")

    detail = await inmemory_agent.get_session("t-detail")

    assert detail is not None
    assert detail.id == "t-detail"
    assert detail.thread_id == "t-detail"
    assert detail.user_id is None

    roles = [m.role for m in detail.messages]
    assert roles == ["user", "assistant"]
    assert detail.messages[0].content == "hello world"
    assert detail.messages[1].content == "echo: hello world"


@pytest.mark.asyncio
async def test_get_session_drops_tool_messages(inmemory_agent):
    """The reconstruction filters ``ToolMessage`` per spec §5."""
    # Seed via a manual aupdate_state so we can include a ToolMessage —
    # the echo graph itself never emits one.
    await _seed_thread(inmemory_agent, "t-tools", "give me weather")

    config = {"configurable": {"thread_id": "t-tools"}}
    state = await inmemory_agent._agent_instance.aget_state(config)
    existing = list(state.values["messages"])
    augmented = existing + [
        ToolMessage(content="64F", tool_call_id="call-1", name="weather"),
        AIMessage(content="It's 64F."),
    ]
    await inmemory_agent._agent_instance.aupdate_state(
        config, {"messages": augmented}
    )

    detail = await inmemory_agent.get_session("t-tools")
    assert detail is not None
    assert all(m.role in {"user", "assistant"} for m in detail.messages)
    contents = [m.content for m in detail.messages]
    assert "64F" not in contents  # ToolMessage was dropped


@pytest.mark.asyncio
async def test_get_session_returns_none_for_unknown_thread(inmemory_agent):
    detail = await inmemory_agent.get_session("never-seeded")
    assert detail is None


@pytest.mark.asyncio
async def test_list_sessions_empty_without_checkpointer():
    agent = LanggraphAgent()
    sessions = await agent.list_sessions()
    assert sessions == []


# -----------------------------------------------------------------------------
# AsyncSqliteSaver — exercises the SELECT thread_id path
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sessions_with_sqlite_saver(sqlite_saver):
    agent = await _make_agent_with_saver(sqlite_saver)

    await _seed_thread(agent, "alpha", "alpha prompt")
    await _seed_thread(agent, "beta", "beta prompt")

    sessions = await agent.list_sessions()

    assert {s.id for s in sessions} == {"alpha", "beta"}
    by_id = {s.id: s for s in sessions}
    assert by_id["alpha"].preview == "alpha prompt"
    assert by_id["beta"].preview == "beta prompt"

    detail = await agent.get_session("alpha")
    assert detail is not None
    assert detail.messages[0].role == "user"
    assert detail.messages[0].content == "alpha prompt"


# -----------------------------------------------------------------------------
# _lc_messages_to_session — direct unit-style exercise
# -----------------------------------------------------------------------------


def test_aimessage_content_blocks_coalesced():
    """Gemini/Claude AIMessage content can be a list of text blocks. The
    helper must concatenate the ``text`` fields into a single string.
    """
    msg = AIMessage(
        content=[
            {"type": "text", "text": "hello"},
            {"type": "text", "text": " world"},
        ]
    )
    out = _lc_messages_to_session([msg])
    assert len(out) == 1
    assert out[0].role == "assistant"
    assert out[0].content == "hello world"


def test_lc_messages_to_session_drops_empty_and_tool():
    msgs = [
        HumanMessage(content="actual prompt"),
        AIMessage(content=""),  # empty -> dropped
        ToolMessage(content="tool result", tool_call_id="x"),  # tool -> dropped
        AIMessage(content="real reply"),
    ]
    out = _lc_messages_to_session(msgs)
    assert [m.role for m in out] == ["user", "assistant"]
    assert [m.content for m in out] == ["actual prompt", "real reply"]
