"""LangGraph: simple linear chat graph (single echo node)."""
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list, add_messages]


def echo(state: State) -> State:
    last = ""
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, HumanMessage):
            last = msg.content if isinstance(msg.content, str) else ""
            break
    return {"messages": [AIMessage(content=f"echo: {last}")]}


_builder = StateGraph(State)
_builder.add_node("echo", echo)
_builder.set_entry_point("echo")
_builder.add_edge("echo", END)
graph = _builder.compile()
