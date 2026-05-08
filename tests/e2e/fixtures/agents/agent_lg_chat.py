"""LangGraph chat agent — no tools.

Used by the chat / streaming / multi-turn / structured / templating /
reload / guardrail scenarios. Provider is selected at import time
from the E2E_PROVIDER env var (one of 'openai' | 'gemini'). Model
literal comes from E2E_MODEL.

The graph is the smallest meaningful LangGraph: a single node that
calls a `ChatModel.invoke(state["messages"])` and appends the result.

Note: this module deliberately does NOT use `from __future__ import
annotations`. The engine loads agent modules via
`importlib.util.spec_from_file_location` + `exec_module` without
registering the module in `sys.modules`. With deferred annotations,
`get_type_hints()` (called by LangGraph's `StateGraph` to resolve
the TypedDict schema) cannot resolve forward references like
`BaseMessage`. Eager annotations evaluate at class-creation time
where the import is in scope.
"""

import os
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    # `add_messages` reducer appends new messages to the prior state
    # instead of overwriting it. Required for multi-turn scenarios that
    # round-trip through a checkpointer + AG-UI: the wire layer only
    # forwards the newest user message on turn N, so without a reducer
    # the prior history would be dropped on entry.
    messages: Annotated[list[BaseMessage], add_messages]


def _make_chat_model() -> object:
    provider = os.environ.get("E2E_PROVIDER", "openai")
    model = os.environ.get("E2E_MODEL", "gpt-5.4-mini")
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=model, temperature=0)
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError(
                "Gemini provider requires GEMINI_API_KEY or GOOGLE_API_KEY in env"
            )
        return ChatGoogleGenerativeAI(
            model=model, temperature=0, google_api_key=api_key
        )
    raise ValueError(f"unknown E2E_PROVIDER={provider!r}")


def _build_graph() -> StateGraph:
    chat = _make_chat_model()

    def call(state: State) -> dict:
        # `add_messages` reducer handles append; return only the new msg.
        response = chat.invoke(state["messages"])
        return {"messages": [response]}

    g: StateGraph = StateGraph(State)
    g.add_node("chat", call)
    g.add_edge(START, "chat")
    g.add_edge("chat", END)
    return g


graph: StateGraph = _build_graph()
