"""
Minimal LangGraph Agent

The absolute simplest LangGraph agent possible.
Perfect for understanding the basics or quick prototyping.
"""

from langgraph.graph import StateGraph, END
from typing import TypedDict


class State(TypedDict):
    messages: list


def echo(state):
    """Simply echo back what the user said with a friendly prefix."""
    user_input = state["messages"][-1] if state["messages"] else "nothing"
    return {"messages": [("ai", f"You said: {user_input}")]}


# Create the minimal graph
graph = StateGraph(State)
graph.add_node("echo", echo)
graph.set_entry_point("echo")
graph.add_edge("echo", END)

# This is what the SDK will import
app = graph 