"""Monkey patches for third-party ag-ui / copilotkit bugs.

Each patch targets a specific upstream issue. When the upstream fix is released,
remove the corresponding ``apply_*`` function **and** its call in ``apply_all()``.

HOW TO VERIFY REMOVAL IS SAFE
------------------------------
1. Remove the patch.
2. Run an agent that uses MCP tools via the /agent/copilotkit/stream endpoint.
3. Trigger a tool call and confirm the stream completes without errors.

PATCHES
-------
1. ``apply_make_json_safe_patch``
   - Upstream bug: ``make_json_safe`` in ``ag_ui_langgraph.utils`` calls
     ``dataclasses.asdict()`` which internally ``copy.deepcopy()``s fields.
     MCP tool objects contain async futures that cannot be pickled.
   - Error: ``TypeError: cannot pickle '_GatheringFuture' object``
   - Upstream issue: https://github.com/ag-ui-protocol/ag-ui/issues/1203
   - Fix: wrap the dataclass branch in a try/except and fall back to ``repr()``.

2. ``apply_tool_call_output_patch``
   - Upstream bug: ``_handle_single_event`` in ``ag_ui_langgraph.agent``
     assumes ``event["data"]["output"]`` on ``OnToolEnd`` is always a single
     ``ToolMessage``. When the tool node returns a **list** (e.g. from MCP
     tools), accessing ``.tool_call_id`` on the list raises ``AttributeError``.
   - Error: ``AttributeError: 'list' object has no attribute 'tool_call_id'``
   - Upstream issue: https://github.com/ag-ui-protocol/ag-ui/issues/1072
   - Upstream PRs: https://github.com/ag-ui-protocol/ag-ui/pull/1073
                    https://github.com/ag-ui-protocol/ag-ui/pull/1164
   - Fix: when ``tool_call_output`` is a list, iterate over its ToolMessage
     items. When it is a raw str/dict, resolve ``tool_call_id`` from event
     metadata.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import asdict, is_dataclass
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Patch 1 — make_json_safe: catch unpicklable dataclass fields
# Upstream issue: https://github.com/ag-ui-protocol/ag-ui/issues/1203
# ---------------------------------------------------------------------------

_ORIGINAL_MAKE_JSON_SAFE = None  # will hold ref to the unpatched function


def _patched_make_json_safe(value: Any, _seen: set[int] | None = None) -> Any:
    """Drop-in replacement for ``ag_ui_langgraph.utils.make_json_safe``.

    The ONLY change vs. upstream is that the dataclass branch (step 5) is
    wrapped in try/except so that objects whose fields cannot be deep-copied
    (e.g. MCP tool sessions containing asyncio futures) fall through to
    ``repr()`` instead of crashing.
    """
    from enum import Enum

    if _seen is None:
        _seen = set()

    obj_id = id(value)
    if obj_id in _seen:
        return "<recursive>"

    # 1. Primitives
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    # 2. Enum
    if isinstance(value, Enum):
        return _patched_make_json_safe(value.value, _seen)

    # 3. Dicts
    if isinstance(value, dict):
        _seen.add(obj_id)
        return {
            _patched_make_json_safe(k, _seen): _patched_make_json_safe(v, _seen)
            for k, v in value.items()
        }

    # 4. Iterable containers
    if isinstance(value, (list, tuple, set, frozenset)):
        _seen.add(obj_id)
        return [_patched_make_json_safe(v, _seen) for v in value]

    # 5. Dataclasses — PATCHED: catch TypeError from unpicklable fields
    if is_dataclass(value) and not isinstance(value, type):
        _seen.add(obj_id)
        try:
            return _patched_make_json_safe(asdict(value), _seen)
        except (TypeError, Exception):
            # asdict() internally deep-copies; MCP tool sessions contain
            # asyncio futures that are not picklable → fall through.
            logger.debug(
                "make_json_safe: asdict() failed for %s, falling back to repr()",
                type(value).__name__,
            )
            return repr(value)

    # 6. Pydantic v2
    if hasattr(value, "model_dump") and callable(value.model_dump):
        _seen.add(obj_id)
        try:
            return _patched_make_json_safe(value.model_dump(), _seen)
        except Exception:
            pass

    # 7. Pydantic v1
    if hasattr(value, "dict") and callable(value.dict):
        _seen.add(obj_id)
        try:
            return _patched_make_json_safe(value.dict(), _seen)
        except Exception:
            pass

    # 8. Generic to_dict
    if hasattr(value, "to_dict") and callable(value.to_dict):
        _seen.add(obj_id)
        try:
            return _patched_make_json_safe(value.to_dict(), _seen)
        except Exception:
            pass

    # 9. Generic __dict__
    if hasattr(value, "__dict__"):
        _seen.add(obj_id)
        try:
            return _patched_make_json_safe(vars(value), _seen)
        except Exception:
            pass

    # 10. Last resort
    return repr(value)


def apply_make_json_safe_patch() -> None:
    """Monkey-patch ``ag_ui_langgraph.utils.make_json_safe``.

    Remove when upstream ships a fix for:
    https://github.com/ag-ui-protocol/ag-ui/issues/1203
    """
    global _ORIGINAL_MAKE_JSON_SAFE

    try:
        import ag_ui_langgraph.agent as agent_mod
        import ag_ui_langgraph.utils as utils_mod
    except ImportError:
        logger.debug("ag_ui_langgraph not installed — skipping make_json_safe patch")
        return

    _ORIGINAL_MAKE_JSON_SAFE = utils_mod.make_json_safe
    utils_mod.make_json_safe = _patched_make_json_safe
    agent_mod.make_json_safe = _patched_make_json_safe

    logger.info(
        "[idun patch] applied make_json_safe patch "
        "(https://github.com/ag-ui-protocol/ag-ui/issues/1203)"
    )


# ---------------------------------------------------------------------------
# Patch 2 — _handle_single_event: handle list / raw tool outputs
# Upstream issue: https://github.com/ag-ui-protocol/ag-ui/issues/1072
# Upstream PRs:   #1073, #1164
# ---------------------------------------------------------------------------

_ORIGINAL_HANDLE_SINGLE_EVENT = None


def apply_tool_call_output_patch() -> None:
    """Monkey-patch ``LangGraphAgent._handle_single_event`` to handle list outputs.

    Remove when upstream merges a fix for:
    https://github.com/ag-ui-protocol/ag-ui/issues/1072
    """
    global _ORIGINAL_HANDLE_SINGLE_EVENT

    try:
        from ag_ui_langgraph.agent import LangGraphAgent
        from ag_ui_langgraph.types import LangGraphEventTypes
    except ImportError:
        logger.debug("ag_ui_langgraph not installed — skipping tool_call_output patch")
        return

    _ORIGINAL_HANDLE_SINGLE_EVENT = LangGraphAgent._handle_single_event

    async def _patched_handle_single_event(self, event, state):
        """Wraps the original _handle_single_event.

        For OnToolEnd events where tool_call_output is a list or a raw
        str/dict (not a ToolMessage), we handle serialization ourselves.
        All other events are delegated to the original implementation.
        """
        from ag_ui.core import (
            EventType,
            ToolCallArgsEvent,
            ToolCallEndEvent,
            ToolCallResultEvent,
            ToolCallStartEvent,
        )
        from ag_ui_langgraph.utils import dump_json_safe, normalize_tool_content
        from langgraph.types import Command

        try:
            from langchain.schema import ToolMessage
        except ImportError:
            from langchain_core.messages import ToolMessage

        event_type = event.get("event")

        if event_type != LangGraphEventTypes.OnToolEnd:
            # Not a tool-end event — delegate entirely to the original.
            async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(self, event, state):
                yield evt
            return

        tool_call_output = event["data"]["output"]

        # --- Case 1: Command objects (already handled upstream) ---------------
        if isinstance(tool_call_output, Command):
            async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(self, event, state):
                yield evt
            return

        # --- Case 2: List of outputs (BUG — upstream crashes here) -----------
        if isinstance(tool_call_output, list):
            tool_messages = [
                m for m in tool_call_output if isinstance(m, ToolMessage)
            ]
            for tool_msg in tool_messages:
                if not self.active_run["has_function_streaming"]:
                    yield self._dispatch_event(
                        ToolCallStartEvent(
                            type=EventType.TOOL_CALL_START,
                            tool_call_id=tool_msg.tool_call_id,
                            tool_call_name=tool_msg.name,
                            parent_message_id=tool_msg.id,
                            raw_event=event,
                        )
                    )
                    yield self._dispatch_event(
                        ToolCallArgsEvent(
                            type=EventType.TOOL_CALL_ARGS,
                            tool_call_id=tool_msg.tool_call_id,
                            delta=json.dumps(event["data"].get("input", {})),
                            raw_event=event,
                        )
                    )
                    yield self._dispatch_event(
                        ToolCallEndEvent(
                            type=EventType.TOOL_CALL_END,
                            tool_call_id=tool_msg.tool_call_id,
                            raw_event=event,
                        )
                    )

                try:
                    normalized = normalize_tool_content(tool_msg.content)
                except Exception:
                    normalized = dump_json_safe(tool_msg.content)

                yield self._dispatch_event(
                    ToolCallResultEvent(
                        type=EventType.TOOL_CALL_RESULT,
                        tool_call_id=tool_msg.tool_call_id,
                        message_id=str(uuid.uuid4()),
                        content=normalized,
                        role="tool",
                    )
                )
            return

        # --- Case 3: Single ToolMessage (happy path) -------------------------
        if isinstance(tool_call_output, ToolMessage):
            async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(self, event, state):
                yield evt
            return

        # --- Case 4: Raw str/dict/other (no tool_call_id attribute) ----------
        # Resolve tool_call_id from event metadata/input as a fallback.
        tool_call_id = getattr(tool_call_output, "tool_call_id", None)
        if not tool_call_id:
            input_data = event.get("data", {}).get("input") or {}
            tool_call_id = (
                event.get("metadata", {}).get("langgraph_tool_call_id")
                or input_data.get("id")
                or input_data.get("tool_call_id")
                or event.get("run_id")
            )

        if not self.active_run["has_function_streaming"]:
            tool_call_name = (
                getattr(tool_call_output, "name", None)
                or event.get("name")
                or event.get("data", {}).get("name")
                or "tool"
            )
            parent_message_id = (
                getattr(tool_call_output, "id", None) or tool_call_id
            )
            input_payload = event.get("data", {}).get("input", {})

            yield self._dispatch_event(
                ToolCallStartEvent(
                    type=EventType.TOOL_CALL_START,
                    tool_call_id=tool_call_id,
                    tool_call_name=tool_call_name,
                    parent_message_id=parent_message_id,
                    raw_event=event,
                )
            )
            yield self._dispatch_event(
                ToolCallArgsEvent(
                    type=EventType.TOOL_CALL_ARGS,
                    tool_call_id=tool_call_id,
                    delta=dump_json_safe(input_payload),
                    raw_event=event,
                )
            )
            yield self._dispatch_event(
                ToolCallEndEvent(
                    type=EventType.TOOL_CALL_END,
                    tool_call_id=tool_call_id,
                    raw_event=event,
                )
            )

        try:
            raw_content = getattr(tool_call_output, "content", tool_call_output)
            normalized = normalize_tool_content(raw_content)
        except Exception:
            normalized = dump_json_safe(
                getattr(tool_call_output, "content", tool_call_output)
            )

        yield self._dispatch_event(
            ToolCallResultEvent(
                type=EventType.TOOL_CALL_RESULT,
                tool_call_id=tool_call_id,
                message_id=str(uuid.uuid4()),
                content=normalized,
                role="tool",
            )
        )

    LangGraphAgent._handle_single_event = _patched_handle_single_event

    logger.info(
        "[idun patch] applied _handle_single_event patch "
        "(https://github.com/ag-ui-protocol/ag-ui/issues/1072)"
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def apply_all() -> None:
    """Apply all ag-ui monkey patches. Call once at server startup.

    To remove a patch after the upstream fix is released:
    1. Delete the ``apply_*`` function and its helper.
    2. Remove its call below.
    3. Test with an MCP-tool agent via /agent/copilotkit/stream.
    """
    apply_make_json_safe_patch()
    apply_tool_call_output_patch()
