"""WS3 A2UI LLM travel-picker example.

A 2-node LangGraph agent that uses Gemini Flash to:

1. Propose 3 distinct travel destinations (as A2UI v0.9 Buttons inside Cards).
2. Acknowledge the user's pick by calling the LLM again for a 2-paragraph pitch
   and emitting a follow-up A2UI surface.

Run via the engine:
    idun agent serve --source file --path examples/a2ui-llm-picker/config.yaml
"""

import os
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

from idun_agent_engine.a2ui import emit_surface, read_a2ui_context

# ----------------------------------------------------------------------------
# State
# ----------------------------------------------------------------------------


class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # WS3: forwarded_props.idun (a2ui action + dataModel) lands here.
    # Plain dict (no reducer) so each turn's value overwrites — no
    # checkpointer staleness. Required: StateGraph filters out top-level
    # keys not declared on the TypedDict, so omitting this means
    # read_a2ui_context() would always return None. Engine treats this
    # field as a sidecar (excluded from chat/structured input mode).
    idun: dict[str, Any] | None


# ----------------------------------------------------------------------------
# LLM factory
# ----------------------------------------------------------------------------

MODEL_ID = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")


def _llm() -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Set GEMINI_API_KEY (or GOOGLE_API_KEY) before running this example. "
            "See examples/a2ui-llm-picker/README.md for setup."
        )
    return ChatGoogleGenerativeAI(
        model=MODEL_ID,
        google_api_key=api_key,
        temperature=0.6,
    )


# ----------------------------------------------------------------------------
# Structured output for the proposal step
# ----------------------------------------------------------------------------


class TravelOption(BaseModel):
    id: str = Field(description="Short slug, lowercase, e.g. 'bali' or 'kyoto'")
    name: str = Field(description="Display name with country, e.g. 'Bali, Indonesia'")
    tagline: str = Field(description="One-line pitch, 8 to 16 words, no clichés")


class TravelProposal(BaseModel):
    intro: str = Field(description="One short sentence introducing the suggestions.")
    options: list[TravelOption] = Field(min_length=3, max_length=3)


# ----------------------------------------------------------------------------
# Graph (nodes + routing land in Tasks 16-17-18)
# ----------------------------------------------------------------------------


# Placeholders so the file imports cleanly while we wire the graph.
async def propose(state: State, config: RunnableConfig) -> State:
    raise NotImplementedError("propose: implemented in Task 16")


async def acknowledge(state: State, config: RunnableConfig) -> State:
    raise NotImplementedError("acknowledge: implemented in Task 17")


def _route_entry(state: State) -> str:
    raise NotImplementedError("_route_entry: implemented in Task 18")


builder = StateGraph(State)
builder.add_node("propose", propose)
builder.add_node("acknowledge", acknowledge)
# set_conditional_entry_point wired in Task 18 once _route_entry exists.
builder.set_entry_point("propose")
builder.add_edge("propose", END)
builder.add_edge("acknowledge", END)
graph = builder.compile()
