"""LangGraph chat agent — no tools.

Used by the chat / streaming / multi-turn / structured / templating /
reload / guardrail scenarios. Provider is selected at import time
from the E2E_PROVIDER env var (one of 'openai' | 'gemini'). Model
literal comes from E2E_MODEL.

The graph is the smallest meaningful LangGraph: a single node that
calls a `ChatModel.invoke(state["messages"])` and appends the result.
"""

from __future__ import annotations

import os
from typing import TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph import END, START, StateGraph


class State(TypedDict):
    messages: list[BaseMessage]


def _make_chat_model() -> object:
    provider = os.environ.get("E2E_PROVIDER", "openai")
    model = os.environ.get("E2E_MODEL", "gpt-5.4-mini")
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=model, temperature=0)
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(model=model, temperature=0)
    raise ValueError(f"unknown E2E_PROVIDER={provider!r}")


def _build_graph() -> StateGraph:
    chat = _make_chat_model()

    def call(state: State) -> State:
        response = chat.invoke(state["messages"])
        return {"messages": [*state["messages"], response]}

    g: StateGraph = StateGraph(State)
    g.add_node("chat", call)
    g.add_edge(START, "chat")
    g.add_edge("chat", END)
    return g


graph: StateGraph = _build_graph()
