from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import tools_condition

from idun_agent_engine import get_prompt
from idun_agent_engine.mcp.helpers import get_langchain_tools

load_dotenv()
log = logging.getLogger(__name__)


def _patch_gemini_array_items() -> None:
    """Some MCP tools (notably mcp-atlassian) emit JSON Schema arrays without
    an ``items`` field, which Gemini's tool-schema validator rejects with
    400 INVALID_ARGUMENT. Patch the converter at two seams:

    1. Input-side: walk the JSON-Schema dict before conversion and add a
       string ``items`` to any array node missing one.
    2. Output-side: walk the resulting ``types.Schema`` tree and do the same,
       since ``_get_properties_from_schema`` produces array-typed property
       dicts whose ``type`` is the ``types.Type.ARRAY`` enum (not the string
       ``"array"``) and a pure dict-walk can miss them.
    """
    try:
        from google.genai import types as _gt
        from langchain_google_genai import _function_utils as _fu
        from langchain_google_genai import chat_models as _cm
    except ImportError:
        return
    if getattr(_fu, "_idun_assistant_patched", False):
        return

    def _is_array(t: object) -> bool:
        if t == "array" or t == "ARRAY":
            return True
        if t is _gt.Type.ARRAY:
            return True
        name = getattr(t, "name", None)
        return isinstance(name, str) and name.upper() == "ARRAY"

    def _fix_dict(node: object) -> None:
        if isinstance(node, dict):
            if _is_array(node.get("type")) and "items" not in node:
                node["items"] = {"type": "string"}
            for v in list(node.values()):
                _fix_dict(v)
        elif isinstance(node, list):
            for v in node:
                _fix_dict(v)

    def _fix_schema(schema: object) -> None:
        if schema is None:
            return
        t = getattr(schema, "type", None) or getattr(schema, "type_", None)
        items = getattr(schema, "items", None)
        if _is_array(t) and items is None:
            try:
                schema.items = _gt.Schema(type=_gt.Type.STRING)
                items = schema.items
            except Exception:
                pass
        if items is not None:
            _fix_schema(items)
        for child in getattr(schema, "any_of", None) or []:
            _fix_schema(child)
        for child in (getattr(schema, "properties", None) or {}).values():
            _fix_schema(child)

    _orig_dict = _fu._dict_to_genai_schema

    def _patched_dict(schema, *args, **kwargs):
        _fix_dict(schema)
        return _orig_dict(schema, *args, **kwargs)

    _fu._dict_to_genai_schema = _patched_dict

    _orig_convert = _fu.convert_to_genai_function_declarations

    def _patched_convert(tools):
        result = _orig_convert(tools)
        for tool in result:
            for fd in getattr(tool, "function_declarations", None) or []:
                _fix_schema(getattr(fd, "parameters", None))
        return result

    _fu.convert_to_genai_function_declarations = _patched_convert
    # chat_models imports the symbol into its own namespace at module load,
    # so rebind there too.
    if hasattr(_cm, "convert_to_genai_function_declarations"):
        _cm.convert_to_genai_function_declarations = _patched_convert

    _fu._idun_assistant_patched = True


_patch_gemini_array_items()


def _make_model() -> BaseChatModel:
    provider = os.getenv("MODEL_PROVIDER", "google").lower()
    name = os.getenv("MODEL_NAME", "gemini-3.1-flash-lite-preview")

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=name,
            google_api_key=os.getenv("GEMINI_API_KEY"),
        )
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=name, api_key=os.getenv("ANTHROPIC_API_KEY"))
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=name, api_key=os.getenv("OPENAI_API_KEY"))

    raise ValueError(f"Unsupported MODEL_PROVIDER={provider!r}")


_model = _make_model()
_system_prompt_obj = get_prompt("system_prompt")
SYSTEM_PROMPT = _system_prompt_obj.content if _system_prompt_obj else ""


async def call_model(state: MessagesState) -> dict:
    tools = await get_langchain_tools()
    bound = _model.bind_tools(tools) if tools else _model
    messages = [SystemMessage(content=SYSTEM_PROMPT), *state["messages"]]
    response = await bound.ainvoke(messages)
    return {"messages": [response]}


async def call_tools(state: MessagesState) -> dict:
    tools = list(await get_langchain_tools() or [])
    by_name = {t.name: t for t in tools}
    last = state["messages"][-1]
    out: list[ToolMessage] = []
    for call in getattr(last, "tool_calls", []) or []:
        name = call["name"]
        tool = by_name.get(name)
        if tool is None:
            content = (
                f"Tool {name!r} is not available. "
                f"Available tools: {sorted(by_name) or 'none'}."
            )
        else:
            try:
                content = str(await tool.ainvoke(call["args"]))
            except Exception as exc:  # noqa: BLE001
                log.exception("Tool %s failed", name)
                content = f"Tool {name!r} failed: {exc}"
        out.append(ToolMessage(content=content, tool_call_id=call["id"], name=name))
    return {"messages": out}


workflow = StateGraph(MessagesState)
workflow.add_node("call_model", call_model)
workflow.add_node("tools", call_tools)
workflow.add_edge(START, "call_model")
workflow.add_conditional_edges("call_model", tools_condition)
workflow.add_edge("tools", "call_model")
