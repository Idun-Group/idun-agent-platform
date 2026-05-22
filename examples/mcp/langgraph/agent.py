"""LangGraph agent wired to two MCP servers via Idun Engine.

The MCP tools are pulled in synchronously at module load. The engine
sets the active MCP registry during boot (see server/lifespan.py), so
``get_langchain_tools_sync`` returns every tool advertised by the
servers declared in ``config.yaml``'s ``mcp_servers`` block. The sync
wrapper drives the underlying async call on a fresh thread, which
keeps it safe to call from inside the engine's running event loop.
"""

from typing import Annotated, TypedDict

from idun_agent_engine.mcp import get_langchain_tools_sync
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition


class State(TypedDict):
    messages: Annotated[list, add_messages]


tools = get_langchain_tools_sync()
llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash").bind_tools(tools)


def chatbot(state: State):
    return {"messages": [llm.invoke(state["messages"])]}


graph = StateGraph(State)
graph.add_node("chatbot", chatbot)
graph.add_node("tools", ToolNode(tools))
graph.add_edge(START, "chatbot")
graph.add_conditional_edges("chatbot", tools_condition)
graph.add_edge("tools", "chatbot")
