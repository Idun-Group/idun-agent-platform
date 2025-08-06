"""
Simple LangGraph Agent Example

This is a basic LangGraph agent that demonstrates the minimum required
structure for integration with the Idun Agent SDK.
"""

from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator


class AgentState(TypedDict):
    """State structure for our agent."""
    messages: Annotated[list, operator.add]


def greeting_node(state):
    """A simple node that returns a greeting message."""
    user_message = state["messages"][-1] if state["messages"] else ""
    
    response = f"Hello! I'm a basic LangGraph agent. You said: '{user_message}'"
    
    return {"messages": [("ai", response)]}


def create_graph():
    """Create and return the LangGraph StateGraph."""
    graph = StateGraph(AgentState)
    
    # Add our greeting node
    graph.add_node("greet", greeting_node)
    
    # Set entry point and end
    graph.set_entry_point("greet")
    graph.add_edge("greet", END)
    
    return graph


# This is the variable that the SDK will import
# The graph_definition in config.yaml points to "example_agent.py:app"
app = create_graph() 