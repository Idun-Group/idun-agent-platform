"""Minimal LangGraph chatbot. SSO enforcement lives entirely in config.yaml."""

from typing import Annotated, TypedDict

from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list, add_messages]


llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")


def chatbot(state: State):
    return {"messages": [llm.invoke(state["messages"])]}


graph = StateGraph(State)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
