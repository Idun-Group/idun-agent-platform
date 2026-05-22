"""LangGraph agent with typed input/output schemas.

Demonstrates a structured agent using LangGraph's native input/output schema
support. The engine auto-discovers InputState and OutputState from the graph
builder's `input=` and `output=` parameters.

Expected discovery:
  input.mode: "structured"
  input.schema: { type: "object", properties: { user_input: { type: "string" } } }
  output.mode: "structured"
  output.schema: { type: "object", properties: { result: { type: "string" } } }
"""

from typing import TypedDict

from langgraph.graph import END, StateGraph


class InputState(TypedDict):
    user_input: str


class OutputState(TypedDict):
    result: str


class FullState(TypedDict):
    user_input: str
    result: str


def process(state: FullState) -> dict:
    return {"result": f"Processed: {state['user_input']}"}


builder = StateGraph(FullState, input=InputState, output=OutputState)
builder.add_node("process", process)
builder.set_entry_point("process")
builder.add_edge("process", END)
graph = builder
