"""Test fixtures for CI smoke flows and engine integration tests.

Provides:

- ``echo_graph`` — minimal LangGraph (StateGraph) referenced by smoke
  configs via ``idun_agent_standalone.testing:echo_graph``.
- ``echo_agent_config()`` — callable returning a dict-shaped EngineConfig
  consumed by engine integration tests
  (``libs/idun_agent_engine/tests/integration/server/conftest.py``).

``langgraph`` is a transitive dependency through ``idun-agent-engine``;
the standalone wheel always ships alongside the engine wheel.
"""

from typing import Any, TypedDict

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


def echo_agent_config() -> dict[str, Any]:
    """Return an EngineConfig dict wiring ``echo_graph`` as a LangGraph agent.

    Used by ``create_app(config_dict=echo_agent_config())`` in engine
    integration tests so they can boot a real agent without any external
    dependencies (no checkpoint DB, no observability provider, no MCP
    servers).
    """
    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Echo",
                "graph_definition": "idun_agent_standalone.testing:echo_graph",
                "checkpointer": {"type": "memory"},
            },
        },
    }
