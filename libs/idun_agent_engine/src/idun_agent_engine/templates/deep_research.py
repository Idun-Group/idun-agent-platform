"""Deep Research Agent Template."""

import os
from deepagents import create_deep_agent
from tavily import TavilyClient

try:
    from langchain.chat_models import init_chat_model
except ImportError:
    try:
        from langchain_core.language_models import init_chat_model
    except ImportError:
        init_chat_model = None

MODEL_NAME = os.getenv("DEEP_RESEARCH_MODEL", "gemini-2.5-flash")

SYSTEM_PROMPT = os.getenv(
    "DEEP_RESEARCH_PROMPT", "Conduct research and write a polished report."
)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

tavily_client = TavilyClient(api_key=TAVILY_API_KEY)


def internet_search(query: str, max_results: int = 5):
    """Run a web search"""
    return tavily_client.search(query, max_results=max_results)


llm = None
if init_chat_model:
    try:
        llm = init_chat_model(MODEL_NAME)
    except Exception as e:
        print(f"Warning: Failed to init model {MODEL_NAME}: {e}")
else:
    print("Warning: init_chat_model not found in langchain.")

graph = create_deep_agent(llm, [internet_search], system_prompt=SYSTEM_PROMPT)
