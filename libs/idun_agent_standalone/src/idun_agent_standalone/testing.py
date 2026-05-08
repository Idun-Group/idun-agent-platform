"""Test fixtures for CI smoke flows and engine integration tests.

Provides:

- ``echo_graph`` — minimal LangGraph (StateGraph) referenced by smoke
  configs via ``idun_agent_standalone.testing:echo_graph``.
- ``echo_agent_config()`` — callable returning a dict-shaped EngineConfig
  consumed by engine integration tests
  (``libs/idun_agent_engine/tests/integration/server/conftest.py``).

The graph uses LangChain message types and the ``add_messages`` reducer
so engine session-reconstruction (``GET /agent/sessions/{id}``) sees
``HumanMessage``/``AIMessage`` pairs that round-trip cleanly through
the checkpointer.

``langgraph`` is a transitive dependency through ``idun-agent-engine``;
the standalone wheel always ships alongside the engine wheel.
"""

from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class _EchoState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


def _echo(state: _EchoState) -> dict[str, list[BaseMessage]]:
    last = state["messages"][-1] if state["messages"] else None
    if isinstance(last, HumanMessage):
        text = last.content
    elif last is not None:
        text = getattr(last, "content", str(last))
    else:
        text = "nothing"
    return {"messages": [AIMessage(content=f"echo: {text}")]}


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
