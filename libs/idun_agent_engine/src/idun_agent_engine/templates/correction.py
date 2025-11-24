"""Correction Agent Template."""

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


class State(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]


MODEL_NAME = os.getenv("CORRECTION_MODEL", "gemini-2.5-flash")
LANGUAGE = os.getenv("CORRECTION_LANGUAGE", "French")

llm = None
if init_chat_model:
    try:
        llm = init_chat_model(MODEL_NAME)
    except Exception as e:
        print(f"Warning: Failed to init model {MODEL_NAME}: {e}")
else:
    print("Warning: init_chat_model not found in langchain.")


async def correct_text(state: State):
    """Correct the spelling, syntax, and grammar of the text."""
    if not llm:
        return {"messages": [SystemMessage(content="Error: Model not initialized. Check logs.")]}

    prompt = (
        f"You are a professional text corrector for {LANGUAGE}. "
        f"Correct the spelling, syntax, grammar, and conjugation of the following text. "
        f"Return ONLY the corrected text without any explanations or modifications to the meaning."
    )

    messages = [SystemMessage(content=prompt)] + state["messages"]

    response = await llm.ainvoke(messages)
    return {"messages": [response]}


workflow = StateGraph(State)
workflow.add_node("correct", correct_text)
workflow.add_edge(START, "correct")
workflow.add_edge("correct", END)

graph = workflow.compile()