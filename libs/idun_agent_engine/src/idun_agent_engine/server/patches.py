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
1. ``apply_tool_call_output_patch``
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

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Patch 1 — _handle_single_event: handle list / raw tool outputs
# Upstream issue: https://github.com/ag-ui-protocol/ag-ui/issues/1072
# Upstream PRs:   #1073, #1164
# ---------------------------------------------------------------------------

_ORIGINAL_HANDLE_SINGLE_EVENT = None


def apply_tool_call_output_patch() -> None:  # noqa: C901
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

    async def _patched_handle_single_event(self, event, state):  # noqa: C901
        """Wraps the original _handle_single_event.

        Replaces the OnToolEnd branch entirely so that list outputs,
        single ToolMessages, Commands, and raw str/dict outputs are all
        handled correctly. All other event types are delegated to the
        original implementation unchanged.
        """
        from ag_ui.core import (
            EventType,
            ToolCallArgsEvent,
            ToolCallEndEvent,
            ToolCallResultEvent,
            ToolCallStartEvent,
        )
        from ag_ui_langgraph.agent import dump_json_safe
        from ag_ui_langgraph.utils import normalize_tool_content
        from langgraph.types import Command

        try:
            from langchain.schema import ToolMessage
        except ImportError:
            from langchain_core.messages import ToolMessage

        event_type = event.get("event")

        # --- Non-tool events: delegate entirely to original -------------------
        if event_type != LangGraphEventTypes.OnToolEnd:
            async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(self, event, state):
                yield evt
            return

        # =====================================================================
        # OnToolEnd — fully replaced to handle all output shapes.
        # =====================================================================
        tool_call_output = event["data"]["output"]

        # -- Helper: emit events for a single ToolMessage ---------------------
        def _emit_for_tool_msg(tool_msg):
            """Yields AG-UI events for a single ToolMessage (sync generator)."""
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
            except Exception:  # noqa: BLE001
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

        # --- Case 1: Command — extract ToolMessages from Command.update ------
        if isinstance(tool_call_output, Command):
            update = tool_call_output.update or {}
            messages = update.get("messages", [])
            tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
            for tool_msg in tool_messages:
                for evt in _emit_for_tool_msg(tool_msg):
                    yield evt
            return

        # --- Case 2: List of outputs (BUG — upstream crashes here) -----------
        if isinstance(tool_call_output, list):
            tool_messages = [
                m for m in tool_call_output if isinstance(m, ToolMessage)
            ]
            for tool_msg in tool_messages:
                for evt in _emit_for_tool_msg(tool_msg):
                    yield evt
            return

        # --- Case 3: Single ToolMessage --------------------------------------
        if isinstance(tool_call_output, ToolMessage):
            for evt in _emit_for_tool_msg(tool_call_output):
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
        except Exception:  # noqa: BLE001
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
    apply_tool_call_output_patch()
