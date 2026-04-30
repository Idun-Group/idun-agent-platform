"""Smoke test that ``ag_ui_langgraph.LangGraphAgent`` accepts the
same kwargs Idun's adapter passes to ``copilotkit.LangGraphAGUIAgent``.

This test is temporary — it exists to prove the base class is a
drop-in replacement before WS1 Task 7 makes the swap. Delete this
file once Task 7 lands.
"""

from __future__ import annotations

import pytest
from ag_ui_langgraph import LangGraphAgent


@pytest.mark.unit
def test_base_class_accepts_idun_kwargs() -> None:
    """The base ``LangGraphAgent`` must accept ``name``, ``description``,
    ``graph``, and ``config`` — the four kwargs Idun's adapter passes
    at libs/idun_agent_engine/src/idun_agent_engine/agent/langgraph/langgraph.py:384-389."""
    from langchain_core.messages import HumanMessage
    from langgraph.graph import StateGraph

    builder = StateGraph(dict)

    def echo_node(state: dict) -> dict:
        return {"messages": [HumanMessage(content="ok")]}

    builder.add_node("echo", echo_node)
    builder.set_entry_point("echo")
    builder.set_finish_point("echo")
    graph = builder.compile()

    agent = LangGraphAgent(
        name="test",
        description="smoke",
        graph=graph,
        config={"callbacks": []},
    )

    assert agent is not None
    # The .run() method must exist — that is the only public surface
    # Idun's adapter calls (libs/.../langgraph.py:1011-1013).
    assert hasattr(agent, "run")
