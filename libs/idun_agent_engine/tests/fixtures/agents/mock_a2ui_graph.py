"""LangGraph fixture that emits a single A2UI surface via emit_surface.

Used by tests that want to verify the full pipe from
LangGraph node -> adispatch_custom_event -> ag-ui-langgraph CustomEvent ->
/agent/run SSE.
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from idun_agent_engine.a2ui import emit_surface


class State(TypedDict, total=False):
    messages: Annotated[list[Any], add_messages]


async def emit_a2ui_node(state: State, config: RunnableConfig) -> dict[str, Any]:
    """Emit a single A2UI surface envelope via the SDK helper."""
    await emit_surface(
        config=config,
        surface_id="test_surface",
        components=[
            {"id": "root", "component": "Text", "text": "hello a2ui"},
        ],
        fallback_text="hello a2ui",
    )
    return {"messages": [AIMessage(content="hello a2ui")]}


def _build() -> Any:
    builder = StateGraph(State)
    builder.add_node("emit", emit_a2ui_node)
    builder.set_entry_point("emit")
    builder.add_edge("emit", END)
    return builder


graph = _build()
