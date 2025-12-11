"""
LangGraph quickstart-style calculator agent using Vertex AI + MCP tools.

Requires: langgraph, langchain-mcp-adapters, langchain-google-vertexai, fastmcp.

Run from repo root (requires Vertex credentials, e.g. GOOGLE_APPLICATION_CREDENTIALS):

    python libs/idun_agent_engine/examples/09_langgraph_mcp/agent.py
"""

import asyncio
import operator
from pathlib import Path
from typing import Literal

from idun_agent_engine.mcp import get_langchain_tools
from langchain.messages import AnyMessage, SystemMessage, ToolMessage
from langchain_google_vertexai import ChatVertexAI
from langgraph.graph import StateGraph, START, END
from typing_extensions import Annotated, TypedDict

CONFIG_PATH = Path(__file__).parent / "config.yaml"


class MessagesState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int


async def llm_call(state: MessagesState):
    """LLM decides whether to call a tool or not."""
    tools = await get_langchain_tools(CONFIG_PATH)
    tools_by_name = {tool.name: tool for tool in tools}

    model = ChatVertexAI(model="gemini-2.5-flash")
    model_with_tools = model.bind_tools(tools)
    return {
        "messages": [
            await model_with_tools.ainvoke(
                [
                    SystemMessage(
                        content=(
                            "You are a helpful assistant tasked with performing arithmetic "
                            "on provided inputs."
                        )
                    )
                ]
                + state["messages"]
            )
        ],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }

async def tool_node(state: MessagesState):
    """Performs the tool call(s)."""
    tools = await get_langchain_tools(CONFIG_PATH)
    tools_by_name = {tool.name: tool for tool in tools}
    results = []
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", []) or []
    for tool_call in tool_calls:
        tool = tools_by_name[tool_call["name"]]
        observation = await tool.ainvoke(tool_call["args"])
        results.append(ToolMessage(content=observation, tool_call_id=tool_call["id"]))
    return {"messages": results}

async def should_continue(state: MessagesState) -> str:
    """Decide whether to call tools or finish."""
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", []) or []
    if tool_calls:
        return "tool_node"
    return END

# Build workflow
agent_builder = StateGraph(MessagesState)
agent_builder.add_node("llm_call", llm_call)
agent_builder.add_node("tool_node", tool_node)

agent_builder.add_edge(START, "llm_call")
agent_builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
agent_builder.add_edge("tool_node", "llm_call")

app= agent_builder
