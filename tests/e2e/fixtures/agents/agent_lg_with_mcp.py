"""LangGraph chat with MCP tools resolved from the engine's active registry.

The engine's ``MCPClientRegistry.get_tools()`` returns serialization-safe
``StructuredTool`` shims (see
``libs/idun_agent_engine/src/idun_agent_engine/mcp/registry.py``
:func:`_serialization_safe_shim`), so this fixture can bind them
directly without any user-side wrapping.

Tools are pre-resolved at module import time. The engine's lifespan
sets the active ``MCPClientRegistry`` before loading the agent module,
but ``registry.get_tools()`` is async. Module import is sync inside
an already-running asyncio loop, so we resolve in a worker thread
running its own loop. The registry's connection dicts are plain data
and re-used per call by the underlying tool's session manager, so the
worker-thread loop dying after import is harmless.

Note: this module deliberately does NOT use ``from __future__ import
annotations`` — see ``agent_lg_chat.py`` for the rationale.
"""

import asyncio
import threading
from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from tests.e2e.fixtures.agents.agent_lg_chat import _make_chat_model


class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


def _resolve_tools_blocking() -> list[Any]:
    from idun_agent_engine.mcp.registry import get_active_registry

    registry = get_active_registry()
    if registry is None or not registry.enabled:
        return []

    container: list[Any] = []
    err: list[BaseException] = []

    def _runner() -> None:
        try:
            container.extend(asyncio.run(registry.get_tools()))
        except BaseException as e:
            err.append(e)

    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    t.join(timeout=60.0)
    if err:
        raise err[0]
    if t.is_alive():
        raise TimeoutError(
            "MCP registry get_tools() did not return within 60s — likely a "
            "stuck stdio child or unreachable MCP server."
        )
    return container


_TOOLS: list[Any] = _resolve_tools_blocking()


def _build_graph() -> StateGraph:
    llm = _make_chat_model()
    if _TOOLS:
        llm = llm.bind_tools(_TOOLS)

    def chat(state: State) -> dict[str, Any]:
        return {"messages": [llm.invoke(state["messages"])]}

    g: StateGraph = StateGraph(State)
    g.add_node("chat", chat)
    g.add_node("tools", ToolNode(_TOOLS))
    g.add_edge(START, "chat")
    g.add_conditional_edges("chat", tools_condition, {"tools": "tools", END: END})
    g.add_edge("tools", "chat")
    return g


graph: StateGraph = _build_graph()
