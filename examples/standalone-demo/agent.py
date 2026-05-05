"""Minimal Gemini-backed LangGraph chat agent for the standalone demo."""

from typing import Annotated, TypedDict

from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list, add_messages]


llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)


def respond(state: State) -> dict:
    return {"messages": [llm.invoke(state["messages"])]}


builder = StateGraph(State)
builder.add_node("respond", respond)
builder.set_entry_point("respond")
builder.add_edge("respond", END)
graph = builder
