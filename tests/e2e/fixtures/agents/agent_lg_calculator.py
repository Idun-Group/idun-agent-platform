"""LangGraph chat with two tools: add(a, b) and multiply(a, b).

Note: no `from __future__ import annotations` — the engine's
importlib-based loader can't resolve PEP-563 deferred refs in
TypedDict-shaped state schemas. (Phase 1.7 fix.)
"""

from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from tests.e2e.fixtures.agents.agent_lg_chat import _make_chat_model


@tool
def add(a: int, b: int) -> int:
    """Return a + b."""
    return a + b


@tool
def multiply(a: int, b: int) -> int:
    """Return a * b."""
    return a * b


_TOOLS = [add, multiply]


def _build_graph() -> StateGraph:
    llm = _make_chat_model().bind_tools(_TOOLS)

    def chat(state: MessagesState) -> MessagesState:
        return {"messages": [llm.invoke(state["messages"])]}

    g: StateGraph = StateGraph(MessagesState)
    g.add_node("chat", chat)
    g.add_node("tools", ToolNode(_TOOLS))
    g.add_edge(START, "chat")
    g.add_conditional_edges("chat", tools_condition, {"tools": "tools", END: END})
    g.add_edge("tools", "chat")
    return g


graph: StateGraph = _build_graph()
