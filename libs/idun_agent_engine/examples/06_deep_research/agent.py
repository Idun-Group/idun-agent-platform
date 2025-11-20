from deepagents import create_deep_agent
from tavily import TavilyClient
from langchain.chat_models import init_chat_model

import os

tavily_client = TavilyClient(api_key=os.environ["TAVILY_KEY"])

def internet_search(query: str, max_results: int = 5):
    """Run a web search"""
    return tavily_client.search(query, max_results=max_results)


model = init_chat_model("groq:openai/gpt-oss-20b")


# Create the agent and get the underlying graph
compiled_agent = create_deep_agent(
    model=model,
    system_prompt="search and make a report",
    tools=[internet_search],
)

# Get the uncompiled graph
agent = compiled_agent.get_graph()
