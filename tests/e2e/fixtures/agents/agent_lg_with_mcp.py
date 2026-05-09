"""LangGraph chat with MCP tools wrapped as plain ``StructuredTool`` shims.

Why the wrapping: the AG-UI LangGraph adapter's ``make_json_safe`` (in
``ag_ui_langgraph/utils.py``) calls ``dataclasses.asdict`` recursively
on emitted event payloads. Native langchain-mcp-adapters tools include
an ``MCPToolCallRequest`` dataclass that holds a LangGraph runtime
reference, which transitively pulls in ``_GatheringFuture`` /
``TaskStepMethWrapper`` instances. ``asdict`` deep-copies every field,
chokes on those, and the AG-UI run aborts mid-stream with
``cannot pickle '_GatheringFuture' object`` after the tool finishes.

We sidestep the issue by wrapping each MCP tool in a fresh
``StructuredTool`` whose coroutine forwards to the registry-resolved
tool's coroutine. The wrapper closure captures only the underlying
tool object (a plain Pydantic-like ``StructuredTool``) — not the
LangGraph runtime — so the AG-UI adapter's recursion stays serializable.

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
from langchain_core.tools import StructuredTool
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
    return container


def _wrap(mcp_tool: Any) -> StructuredTool:
    underlying = mcp_tool

    async def _shim(**kwargs: Any) -> str:
        result = await underlying.ainvoke(kwargs)
        if isinstance(result, str):
            return result
        if isinstance(result, list):
            parts: list[str] = []
            for item in result:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(str(item.get("text", "")))
                else:
                    parts.append(str(item))
            return "\n".join(parts)
        return str(result)

    return StructuredTool(
        name=underlying.name,
        description=underlying.description or "",
        args_schema=underlying.args_schema,
        coroutine=_shim,
    )


_TOOLS: list[Any] = [_wrap(t) for t in _resolve_tools_blocking()]


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
