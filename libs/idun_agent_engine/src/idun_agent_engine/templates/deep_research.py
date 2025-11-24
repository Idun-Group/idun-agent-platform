"""Deep Research Agent Template."""

import os
from typing import TypedDict, Annotated, List

try:
    from langchain.chat_models import init_chat_model
except ImportError:
    try:
        from langchain_core.language_models import init_chat_model
    except ImportError:
        init_chat_model = None

from langchain_core.messages import SystemMessage, BaseMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from tavily import TavilyClient


class State(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]


MODEL_NAME = os.getenv("DEEP_RESEARCH_MODEL", "gemini-2.5-flash")
SYSTEM_PROMPT = os.getenv("DEEP_RESEARCH_PROMPT", "Conduct research and write a polished report.")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

llm = None
if init_chat_model:
    try:
        llm = init_chat_model(MODEL_NAME)
    except Exception as e:
        print(f"Warning: Failed to init model {MODEL_NAME}: {e}")
else:
    print("Warning: init_chat_model not found in langchain.")

tavily_client = None
if TAVILY_API_KEY:
    try:
        tavily_client = TavilyClient(api_key=TAVILY_API_KEY)
    except Exception as e:
        print(f"Warning: Failed to init Tavily client: {e}")


def internet_search(query: str, max_results: int = 5):
    """Run a web search"""
    if not tavily_client:
        return "Error: Tavily client not initialized. Check TAVILY_API_KEY."
    return tavily_client.search(query, max_results=max_results)


async def research_and_respond(state: State):
    """Conduct research and provide a response."""
    if not llm:
        return {"messages": [SystemMessage(content="Error: Model not initialized. Check logs.")]}

    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, 'content') else str(last_message)

    search_results = internet_search(query)

    enhanced_prompt = f"{SYSTEM_PROMPT}\n\nUser Query: {query}\n\nSearch Results: {search_results}\n\nBased on the search results above, provide a comprehensive research-based response."

    messages = [SystemMessage(content=enhanced_prompt)] + state["messages"]

    response = await llm.ainvoke(messages)
    return {"messages": [response]}


workflow = StateGraph(State)
workflow.add_node("research", research_and_respond)
workflow.add_edge(START, "research")
workflow.add_edge("research", END)

graph = workflow.compile()
