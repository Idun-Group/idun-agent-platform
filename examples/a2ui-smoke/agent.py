"""WS2 A2UI smoke-test agent — comprehensive Basic Catalog v0.9 showcase.

Deterministic LangGraph agent. Every user message gets a fixed A2UI
surface that exercises (almost) every component in the v0.9 Basic
Catalog: typography (h1-h5, body, caption), layout (Column, Row,
Card, Divider), inputs (TextField, CheckBox, Slider, DateTimeInput,
ChoicePicker), visuals (Image, Icon), Button, and Tabs.

The StateGraph instantiation + compile happen at module level so the
standalone wizard's scanner (AST-only, no execution) detects the
agent.

Run via:
    idun-standalone init           # standalone wizard auto-detects this file
    # OR (engine-only smoke):
    uv run idun agent serve --source file --path examples/a2ui-smoke/config.yaml
"""

from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from idun_agent_engine.a2ui import emit_surface


class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


_FALLBACK = (
    "A2UI v0.9 Basic Catalog showcase — typography, layout, inputs, "
    "visuals, and action components rendered in one surface."
)


# -- Showcase surface ---------------------------------------------------------
#
# A2UI v0.9 components are FLAT and reference each other by ID. Containers
# (Card, Column, Row, Tabs) reference children by ID; leaves (Text, Image,
# Button, etc.) are siblings at the same level. The `root` component is the
# entry point.

_COMPONENTS = [
    # ---- Typography section -------------------------------------------------
    {"id": "h_typo", "component": "Text", "text": "Typography", "variant": "h2"},
    {"id": "t_h1", "component": "Text", "text": "Heading 1", "variant": "h1"},
    {"id": "t_h2", "component": "Text", "text": "Heading 2", "variant": "h2"},
    {"id": "t_h3", "component": "Text", "text": "Heading 3", "variant": "h3"},
    {"id": "t_h4", "component": "Text", "text": "Heading 4", "variant": "h4"},
    {"id": "t_h5", "component": "Text", "text": "Heading 5", "variant": "h5"},
    {
        "id": "t_body",
        "component": "Text",
        "text": "Body text with **bold**, *italic*, and `code`.",
    },
    {
        "id": "t_caption",
        "component": "Text",
        "text": "Caption text — small, muted.",
        "variant": "caption",
    },
    {"id": "div_1", "component": "Divider"},
    # ---- Layout: Row --------------------------------------------------------
    {"id": "h_layout", "component": "Text", "text": "Layout", "variant": "h2"},
    {
        "id": "row_left",
        "component": "Text",
        "text": "Left column of a Row.",
    },
    {
        "id": "row_right",
        "component": "Text",
        "text": "Right column of a Row.",
    },
    {
        "id": "row_demo",
        "component": "Row",
        "children": ["row_left", "row_right"],
        "justify": "spaceBetween",
    },
    {"id": "div_2", "component": "Divider"},
    # ---- Visuals -----------------------------------------------------------
    {"id": "h_visuals", "component": "Text", "text": "Visuals", "variant": "h2"},
    {
        "id": "img_demo",
        "component": "Image",
        "url": "https://placehold.co/400x180/8c52ff/ffffff?text=A2UI+Image",
    },
    {
        "id": "icon_demo",
        "component": "Icon",
        "name": "star",
    },
    {"id": "div_3", "component": "Divider"},
    # ---- Inputs ------------------------------------------------------------
    {"id": "h_inputs", "component": "Text", "text": "Inputs", "variant": "h2"},
    {
        "id": "input_text",
        "component": "TextField",
        "label": "Your name",
        "value": {"path": "/name"},
    },
    {
        "id": "input_check",
        "component": "CheckBox",
        "label": "Subscribe to updates",
        "value": {"path": "/agreed"},
    },
    {
        "id": "input_choice",
        "component": "ChoicePicker",
        "label": "Pick one",
        "value": {"path": "/color"},
        "options": [
            {"label": "Red", "value": "red"},
            {"label": "Green", "value": "green"},
            {"label": "Blue", "value": "blue"},
        ],
    },
    {
        "id": "input_slider",
        "component": "Slider",
        "label": "Volume",
        "value": {"path": "/volume"},
        "min": 0,
        "max": 100,
        "step": 1,
    },
    {
        "id": "input_date",
        "component": "DateTimeInput",
        "label": "Pick a date",
        "value": {"path": "/when"},
    },
    {"id": "div_4", "component": "Divider"},
    # ---- Action -----------------------------------------------------------
    {"id": "h_action", "component": "Text", "text": "Action", "variant": "h2"},
    {
        "id": "btn_label",
        "component": "Text",
        "text": "Click me",
    },
    {
        "id": "btn_demo",
        "component": "Button",
        "child": "btn_label",
    },
    {"id": "div_5", "component": "Divider"},
    # ---- Tabs --------------------------------------------------------------
    {"id": "h_tabs", "component": "Text", "text": "Tabs", "variant": "h2"},
    {
        "id": "tab_a_body",
        "component": "Text",
        "text": "Content of tab A.",
    },
    {
        "id": "tab_b_body",
        "component": "Text",
        "text": "Content of tab B with **markdown**.",
    },
    {
        "id": "tab_c_body",
        "component": "Text",
        "text": "Content of tab C.",
    },
    {
        "id": "tabs_demo",
        "component": "Tabs",
        "tabs": [
            {"title": "Tab A", "child": "tab_a_body"},
            {"title": "Tab B", "child": "tab_b_body"},
            {"title": "Tab C", "child": "tab_c_body"},
        ],
    },
    # ---- Top-level Column wraps all sections -------------------------------
    {
        "id": "showcase_column",
        "component": "Column",
        "children": [
            "h_typo",
            "t_h1",
            "t_h2",
            "t_h3",
            "t_h4",
            "t_h5",
            "t_body",
            "t_caption",
            "div_1",
            "h_layout",
            "row_demo",
            "div_2",
            "h_visuals",
            "img_demo",
            "icon_demo",
            "div_3",
            "h_inputs",
            "input_text",
            "input_check",
            "input_choice",
            "input_slider",
            "input_date",
            "div_4",
            "h_action",
            "btn_demo",
            "div_5",
            "h_tabs",
            "tabs_demo",
        ],
    },
    # ---- Root: Card wrapping the showcase Column ---------------------------
    {
        "id": "root",
        "component": "Card",
        "child": "showcase_column",
    },
]


async def respond(state: State, config: RunnableConfig) -> State:
    """Emit the comprehensive A2UI showcase + a fallback AIMessage."""
    await emit_surface(
        config=config,
        surface_id="a2ui_showcase",
        components=_COMPONENTS,
        fallback_text=_FALLBACK,
        metadata={"source": "smoke_test", "shape": "showcase"},
        # Seed the dataModel so inputs round-trip user edits locally.
        # Each /key here corresponds to a {"path": "/key"} binding on
        # the input component above.
        data={
            "name": "",
            "agreed": False,
            "color": "blue",
            "volume": 50,
            "when": "",
        },
    )
    return {"messages": [AIMessage(content=_FALLBACK)]}


# Module-level binding so the standalone wizard's AST scanner detects
# this as a LangGraph agent. _build() inside a function would hide it.
builder = StateGraph(State)
builder.add_node("respond", respond)
builder.set_entry_point("respond")
builder.add_edge("respond", END)
graph = builder.compile()
