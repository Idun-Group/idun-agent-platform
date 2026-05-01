"""WS2 A2UI smoke-test agent.

Deterministic LangGraph agent — no LLM required, no API keys. On every
user message, it emits a fixed A2UI surface (a Card listing 3 NYC
coffee shops) plus a fallback-text AIMessage. Lets you visually
confirm that the standalone UI's MessageView renders the surface
below the markdown text body.

Run via:
    uv run idun agent serve --source file --path examples/a2ui-smoke/config.yaml
"""

from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from idun_agent_engine.a2ui import emit_surface


class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


_FALLBACK = (
    "Found 3 coffee shops in NYC: Blue Bottle (5th Ave), "
    "Stumptown (Ace Hotel), and Joe's (West Village)."
)


async def respond(state: State, config: RunnableConfig) -> State:
    """Emit a fixed A2UI surface + a fallback AIMessage on every turn."""
    await emit_surface(
        config=config,
        surface_id="coffee_results",
        components=[
            {
                "id": "root",
                "component": "Card",
                "children": [
                    {
                        "id": "title",
                        "component": "Text",
                        "text": "☕ 3 Coffee Shops in NYC",
                    },
                    {
                        "id": "shop1",
                        "component": "Text",
                        "text": "Blue Bottle — 5th Ave",
                    },
                    {
                        "id": "shop2",
                        "component": "Text",
                        "text": "Stumptown — Ace Hotel",
                    },
                    {
                        "id": "shop3",
                        "component": "Text",
                        "text": "Joe's — West Village",
                    },
                ],
            },
        ],
        fallback_text=_FALLBACK,
        metadata={"source": "smoke_test"},
    )
    return {"messages": [AIMessage(content=_FALLBACK)]}


def _build():
    builder = StateGraph(State)
    builder.add_node("respond", respond)
    builder.set_entry_point("respond")
    builder.add_edge("respond", END)
    return builder.compile()


graph = _build()
