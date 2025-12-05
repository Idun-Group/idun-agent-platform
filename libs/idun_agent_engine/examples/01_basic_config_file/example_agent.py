"""Simple LangGraph Agent Example.

This is a basic LangGraph agent that demonstrates the minimum required
structure for integration with the Idun Agent Engine.
"""

import operator
from typing import Annotated, TypedDict

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import END, StateGraph, MessagesState



class AgentState(MessagesState):
    """State structure for our agent."""



def greeting_node(state):
    """A simple node that returns a greeting message."""
    user_message = state["messages"][-1] if state["messages"] else HumanMessage(content="")

    response = f"Hello! I'm a basic LangGraph agent. You said: '{user_message.content}'"

    return {"messages": [("ai", response)]}

def no_greeting_node(state: AgentState) -> AgentState:
    """A simple node that returns a no greeting message."""
    return {"messages": [AIMessage(content="No greeting for you!")]}


def create_graph():
    """Create and return the LangGraph StateGraph."""
    graph = StateGraph(AgentState)

    # Add our greeting node
    graph.add_node("greet", greeting_node)
    graph.add_node("no_greeting", no_greeting_node)

    # Set entry point and end
    graph.set_entry_point("greet")
    graph.add_edge("greet", "no_greeting")
    graph.add_edge("no_greeting", END)


    return graph


# This is the variable that the Engine will import
# The graph_definition in config.yaml points to "example_agent.py:app"
app = create_graph()
