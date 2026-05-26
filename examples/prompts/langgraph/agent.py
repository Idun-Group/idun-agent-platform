"""LangGraph agent whose system prompt is loaded from a managed prompt.

``get_prompt(...)`` reads from the engine's in-memory prompts registry,
populated by the standalone (or the engine's own bootstrap) from the
``prompts:`` block in ``config.yaml`` before this file is imported.
"""

from typing import Annotated, TypedDict

from idun_agent_engine.prompts import get_prompt
from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list, add_messages]


system_prompt = get_prompt("system-prompt").format(role="customer support agent")

llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")


def chatbot(state: State):
    messages = [SystemMessage(content=system_prompt)] + list(state["messages"])
    return {"messages": [llm.invoke(messages)]}


graph = StateGraph(State)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
