"""Simple LangGraph chat agent example.

Demonstrates a basic chat agent with MessagesState. The engine auto-discovers
this as a chat-mode agent since the state schema only has a 'messages' field.
"""

from typing import Annotated, Any, TypedDict

from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list[dict[str, Any]], add_messages]


def respond(state: State) -> dict:
    messages = state.get("messages", [])
    last = messages[-1] if messages else None
    content = last.get("content", "") if isinstance(last, dict) else str(last)
    return {"messages": [{"role": "assistant", "content": f"You said: {content}"}]}


builder = StateGraph(State)
builder.add_node("respond", respond)
builder.set_entry_point("respond")
builder.add_edge("respond", END)
graph = builder
