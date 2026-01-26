"""Translation Agent Template."""

import os
from typing import Annotated, TypedDict

# Try importing init_chat_model, fallback if necessary
try:
    from langchain.chat_models import init_chat_model
except ImportError:
    try:
        from langchain_core.language_models import init_chat_model
    except ImportError:
        init_chat_model = None

from langchain_core.messages import BaseMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


# Define the state
class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# Read configuration from environment variables
# These are set by ConfigBuilder when initializing the agent
MODEL_NAME = os.getenv("TRANSLATION_MODEL", "gemini-2.5-flash")
SOURCE_LANG = os.getenv("TRANSLATION_SOURCE_LANG", "English")
TARGET_LANG = os.getenv("TRANSLATION_TARGET_LANG", "French")

# Initialize the model
llm = None
if init_chat_model:
    try:
        # init_chat_model requires langchain>=0.2.x or similar.
        # It auto-detects provider from model name (e.g. "gpt-4" -> openai, "claude" -> anthropic)
        # provided the integration packages are installed.
        llm = init_chat_model(MODEL_NAME)
    except Exception as e:
        print(f"Warning: Failed to init model {MODEL_NAME}: {e}")
else:
    print("Warning: init_chat_model not found in langchain.")


async def translate(state: State):
    """Translate the last message."""
    if not llm:
        return {
            "messages": [
                SystemMessage(content="Error: Model not initialized. Check logs.")
            ]
        }

    prompt = (
        f"You are a professional translator. Translate the following text "
        f"from {SOURCE_LANG} to {TARGET_LANG}. Output ONLY the translation."
    )

    messages = [SystemMessage(content=prompt)] + state["messages"]

    response = await llm.ainvoke(messages)
    return {"messages": [response]}


workflow = StateGraph(State)
workflow.add_node("translate", translate)
workflow.add_edge(START, "translate")
workflow.add_edge("translate", END)

graph = workflow.compile()
