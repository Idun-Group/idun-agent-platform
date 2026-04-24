"""Test helpers — minimal agents that don't need real LLM keys.

Importing this module is cheap. ``echo_graph`` is built lazily so tests that
only need ``echo_agent_config`` (a config dict) don't pay the LangGraph
import cost. ``echo_agent_config`` returns the same config dict shape the
engine accepts via ``create_app(config_dict=...)``.
"""

from typing import Annotated, Any, TypedDict

try:  # langgraph is an engine-side dep; make import optional for config-only use.
    from langgraph.graph.message import add_messages as _add_messages
except Exception:  # pragma: no cover — exercised by environments missing langgraph
    _add_messages = None  # type: ignore[assignment]


class _EchoState(TypedDict, total=False):
    """Module-scope state class so LangGraph can resolve type hints."""

    messages: Annotated[list, _add_messages] if _add_messages is not None else list


def echo_agent_config() -> dict[str, Any]:
    """Return a config dict for a trivial echo LangGraph agent.

    The graph is loaded by the engine via ``graph_definition`` —
    ``idun_agent_standalone.testing:echo_graph`` — so importing this module
    by itself does not require LangGraph to be installed.
    """
    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test-echo",
                "graph_definition": (
                    "idun_agent_standalone.testing:echo_graph"
                ),
                "checkpointer": {"type": "memory"},
            },
        },
    }


def _build_echo_graph():
    """Construct an uncompiled echo StateGraph (deferred import)."""
    from langchain_core.messages import AIMessage
    from langgraph.graph import END, StateGraph

    def _echo_node(state: _EchoState) -> _EchoState:
        last = state["messages"][-1] if state["messages"] else None
        text = getattr(last, "content", "") if last else ""
        return {"messages": [AIMessage(content=f"echo: {text}")]}

    g = StateGraph(_EchoState)
    g.add_node("echo", _echo_node)
    g.set_entry_point("echo")
    g.add_edge("echo", END)
    return g


# Module-level StateGraph variable so the engine's `graph_definition`
# loader (`module:variable`) can resolve it directly. We try to build it
# eagerly; if langgraph is missing the symbol stays ``None`` and config
# validation continues to work for tests that don't actually run the agent.
try:
    echo_graph = _build_echo_graph()
except Exception:  # pragma: no cover — environments missing langgraph
    echo_graph = None  # type: ignore[assignment]
