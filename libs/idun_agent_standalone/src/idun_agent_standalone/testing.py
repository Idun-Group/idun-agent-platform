"""Test fixtures for CI smoke flows.

Provides a minimal LangGraph that can be referenced from a
``config.yaml`` as ``idun_agent_standalone.testing:echo_graph`` so the
wheel-install-smoke script and the docker-smoke job can boot the
standalone end-to-end without scaffolding a separate ``agent.py``.

``langgraph`` is a transitive dependency through ``idun-agent-engine``;
the standalone wheel always ships alongside the engine wheel.
"""

from typing import TypedDict

from langgraph.graph import END, StateGraph


class _EchoState(TypedDict):
    messages: list


def _echo(state: _EchoState) -> dict:
    last = state["messages"][-1] if state["messages"] else "nothing"
    return {"messages": [("ai", f"echo: {last}")]}


_builder = StateGraph(_EchoState)
_builder.add_node("echo", _echo)
_builder.set_entry_point("echo")
_builder.add_edge("echo", END)

# The engine accepts an uncompiled StateGraph here and applies its own
# compile-with-checkpointer step (see engine/agent/langgraph/langgraph.py).
echo_graph: StateGraph = _builder
