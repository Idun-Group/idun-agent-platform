from typing import TypedDict
from langgraph.graph import StateGraph

class SimpleState(TypedDict):
    value: int

def node_a(state: SimpleState):
    print("Executing Node A")
    return {"value": state["value"] + 1}

def node_b(state: SimpleState):
    print("Executing Node B")
    return {"value": state["value"] * 2}

# Define the graph
builder = StateGraph(SimpleState)
builder.add_node("a", node_a)
builder.add_node("b", node_b)
builder.set_entry_point("a")
builder.add_edge("a", "b")
builder.set_finish_point("b")

# The variable to be loaded by the agent manager
simple_test_graph = builder 