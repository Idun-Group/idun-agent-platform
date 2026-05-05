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
# Surface builder for the proposal step
# ----------------------------------------------------------------------------


def _proposal_surface_components(p: TravelProposal) -> list[dict]:
    """Card column with intro text + per-option Card[Title, Tagline, Button].

    Each option Button carries the destination identity as scalar fields
    in its action.event.context (id, name, tagline). A2UI v0.9
    DynamicValue does not allow object literals in context (only string,
    number, boolean, array, DataBinding, FunctionCall) so we flatten
    rather than nest — same information reaches acknowledge without
    losing schema validity.
    """
    children: list[str] = ["intro"]
    out: list[dict] = [
        {"id": "intro", "component": "Text", "text": p.intro, "variant": "h3"},
    ]
    for i, opt in enumerate(p.options):
        title_id = f"opt{i}_title"
        tag_id = f"opt{i}_tag"
        lbl_id = f"opt{i}_lbl"
        btn_id = f"opt{i}_btn"
        col_id = f"opt{i}_col"
        card_id = f"opt{i}_card"
        out.extend([
            {"id": title_id, "component": "Text", "text": opt.name, "variant": "h4"},
            {"id": tag_id, "component": "Text", "text": opt.tagline},
            {"id": lbl_id, "component": "Text", "text": "Choose this destination"},
            {
                "id": btn_id, "component": "Button", "child": lbl_id,
                "action": {"event": {
                    "name": "pick_destination",
                    "context": {
                        "id": opt.id,
                        "name": opt.name,
                        "tagline": opt.tagline,
                    },
                }},
            },
            {
                "id": col_id, "component": "Column",
                "children": [title_id, tag_id, btn_id],
            },
            {"id": card_id, "component": "Card", "child": col_id},
        ])
        children.append(card_id)
    out.append({"id": "root", "component": "Column", "children": children})
    return out


# ----------------------------------------------------------------------------
# propose
# ----------------------------------------------------------------------------


_PROPOSE_SYSTEM = (
    "You are a travel concierge. The user describes their preferences;"
    " you propose exactly THREE destinations that fit. Each must be"
    " distinct (different region, climate, or vibe), realistic, and"
    " short enough to render as a button. Avoid 'top 10' clichés."
)


async def propose(state: State, config: RunnableConfig) -> State:
    last_user = next(
        (m for m in reversed(state["messages"]) if m.type == "human"),
        None,
    )
    prompt = (
        last_user.content
        if last_user is not None
        else "I want a relaxing trip somewhere warm under $1500."
    )

    proposal: TravelProposal = (
        await _llm()
        .with_structured_output(TravelProposal)
        .ainvoke([
            SystemMessage(_PROPOSE_SYSTEM),
            HumanMessage(prompt),
        ])
    )

    components = _proposal_surface_components(proposal)
    await emit_surface(
        config=config,
        surface_id="travel_proposal",
        components=components,
        fallback_text=(
            proposal.intro + " " + ", ".join(o.name for o in proposal.options)
        ),
    )
    return {"messages": [AIMessage(content=proposal.intro)]}


# ----------------------------------------------------------------------------
# Graph (acknowledge + routing land in Tasks 17-18)
# ----------------------------------------------------------------------------


_ACK_SYSTEM = (
    "The user just chose a travel destination. Write a 2-paragraph pitch:"
    " paragraph 1 (4-6 sentences) describes the destination; paragraph 2"
    " (3-5 sentences) suggests one perfect day. Concrete, sensory, no"
    " marketing-speak."
)


async def acknowledge(state: State, config: RunnableConfig) -> State:
    """Read the picked destination from the action context, generate a pitch,
    and emit a follow-up surface.

    The propose surface uses flat scalars in action.event.context
    ({id, name, tagline}) per A2UI v0.9 DynamicValue constraints (see T16
    deviation). We read those scalars directly off the typed action.
    """
    ctx = read_a2ui_context(state)
    if ctx is None or ctx.action.name != "pick_destination":
        return {"messages": [AIMessage(content="No destination selected.")]}

    chosen = ctx.action.context or {}
    name = chosen.get("name", "your destination")
    tagline = chosen.get("tagline", "")
    chosen_id = chosen.get("id", "x")

    pitch_msg = await _llm().ainvoke([
        SystemMessage(_ACK_SYSTEM),
        HumanMessage(f"Destination: {name}.\nTagline: {tagline}."),
    ])
    pitch = (
        pitch_msg.content
        if isinstance(pitch_msg.content, str)
        else str(pitch_msg.content)
    )
    paragraphs = [p.strip() for p in pitch.split("\n\n") if p.strip()][:2]

    components = [
        {"id": "h", "component": "Text", "text": name, "variant": "h2"},
        {"id": "tag", "component": "Text", "text": tagline, "variant": "caption"},
        *[
            {"id": f"p{i}", "component": "Text", "text": para}
            for i, para in enumerate(paragraphs)
        ],
        {"id": "again_lbl", "component": "Text", "text": "Ask another question"},
        {
            "id": "again_btn",
            "component": "Button",
            "child": "again_lbl",
            "action": {"event": {"name": "ask_again", "context": {}}},
        },
        {
            "id": "col",
            "component": "Column",
            "children": [
                "h", "tag",
                *[f"p{i}" for i in range(len(paragraphs))],
                "again_btn",
            ],
        },
        {"id": "root", "component": "Card", "child": "col"},
    ]
    await emit_surface(
        config=config,
        surface_id=f"travel_pitch_{chosen_id}",
        fallback_text=f"Pitch for {name}.",
        components=components,
    )
    return {"messages": [AIMessage(content=name)]}


def _route_entry(state: State) -> str:
    """Route to acknowledge() iff the turn carries a non-ask_again action.

    no idun                                  -> propose (initial / no action)
    idun.a2uiClientMessage missing           -> propose
    action.name == 'ask_again'               -> propose (re-suggest options)
    action.name == 'pick_destination'        -> acknowledge
    anything else                            -> acknowledge (fall-through)
    """
    state_dict = state if isinstance(state, dict) else dict(state)
    idun = state_dict.get("idun")
    if not (isinstance(idun, dict) and "a2uiClientMessage" in idun):
        return "propose"
    msg = idun["a2uiClientMessage"]
    name = (
        (msg.get("action") or {}).get("name")
        if isinstance(msg, dict) else None
    )
    return "propose" if name == "ask_again" else "acknowledge"


builder = StateGraph(State)
builder.add_node("propose", propose)
builder.add_node("acknowledge", acknowledge)
builder.set_conditional_entry_point(
    _route_entry,
    {"propose": "propose", "acknowledge": "acknowledge"},
)
builder.add_edge("propose", END)
builder.add_edge("acknowledge", END)
graph = builder.compile()
