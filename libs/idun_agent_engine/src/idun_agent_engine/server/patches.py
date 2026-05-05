"""Monkey patches for third-party ag-ui / copilotkit bugs.

Each patch targets a specific upstream issue. When the upstream fix is released,
remove the corresponding ``apply_*`` function **and** its call in ``apply_all()``.

HOW TO VERIFY REMOVAL IS SAFE
------------------------------
1. Remove the patch.
2. Run an agent that uses MCP tools via the /agent/run endpoint.
3. Trigger a tool call and confirm the stream completes without errors.
4. For the Gemini patch: send a simple chat message and confirm TEXT_MESSAGE_*
   events appear in the stream (not just RAW events).

PATCHES
-------
1. ``apply_handle_single_event_patch``
   Combines two fixes into a single ``_handle_single_event`` monkey-patch.
   Re-evaluated against ag-ui-langgraph 0.0.35 — see findings inline below.

   a) **OnToolEnd — list / raw tool outputs**
      - Original upstream bug: ``_handle_single_event`` assumed
        ``event["data"]["output"]`` on ``OnToolEnd`` was always a single
        ``ToolMessage``. When the tool node returned a **list** (e.g. from
        MCP tools), accessing ``.tool_call_id`` on the list raised
        ``AttributeError: 'list' object has no attribute 'tool_call_id'``.
      - Status on 0.0.35: the *crash* is gone. Upstream now does
        ``isinstance(tool_call_output, ToolMessage)``; non-ToolMessage
        non-Command outputs are logged and silently skipped (see
        ``ag_ui_langgraph/agent.py`` lines 1231-1236 on 0.0.35).
      - Why this patch is still needed: silent-skip means MCP tools that
        return a *list of ToolMessages* never emit ``TOOL_CALL_RESULT``
        events to the client. The Idun patch iterates the list and emits
        per-ToolMessage events. Raw str/dict outputs (Case 4) likewise
        recover ``tool_call_id`` from event metadata so the result still
        reaches the client.
      - Upstream issue: https://github.com/ag-ui-protocol/ag-ui/issues/1072
      - Upstream PRs: https://github.com/ag-ui-protocol/ag-ui/pull/1073
                       https://github.com/ag-ui-protocol/ag-ui/pull/1164

   b) **OnChatModelStream — Gemini finish_reason drops content**
      - Upstream bug: the ``OnChatModelStream`` branch still does
        ``if response_metadata.get('finish_reason'): return`` unconditionally
        (see ``ag_ui_langgraph/agent.py`` lines 911-912 on 0.0.35).
        Gemini models (e.g. gemini-2.5-flash) send the **entire response +
        finish_reason in a single chunk**. The early return discards the
        content, so no ``TEXT_MESSAGE_START/CONTENT/END`` events are emitted.
      - Status on 0.0.35: not fixed.
      - Symptom: the agent's text response only appears in RAW events and
        MESSAGES_SNAPSHOT, never as proper TEXT_MESSAGE_* events.
      - Upstream issue: not yet filed (ag-ui assumes OpenAI-style streaming
        where finish_reason arrives on a separate empty chunk).
      - Fix: only skip the chunk when ``finish_reason`` is set **and** there
        is no content and no tool call data. When content IS present, we
        temporarily strip ``finish_reason`` from response_metadata before
        delegating to the original handler, then restore it.
      - Dict-chunk safety: chunks may arrive as plain dicts (not just
        ``BaseMessage`` instances) from some LangChain providers/forwarders.
        Upstream 0.0.35 added a ``_chunk_get(c, key, default)`` accessor
        (``ag_ui_langgraph/agent.py`` lines 903-906) for exactly this case;
        the patch mirrors that pattern so dict-shaped chunks don't crash
        with ``AttributeError`` before the Gemini fix can even run.

REMOVED PATCHES
---------------
- ``apply_prepare_stream_patch`` (removed 2026-04-30 with bump to
  ag-ui-langgraph 0.0.35). Upstream ``prepare_stream`` now computes
  ``is_continuation`` from the intersection of incoming non-ToolMessage IDs
  with checkpoint IDs and additionally guards the
  ``prepare_regenerate_stream`` call behind ``last_user_id in checkpoint_ids``
  (see ``ag_ui_langgraph/agent.py`` lines 460-492 on 0.0.35), so the
  false-positive ``ValueError("Message ID not found in history")`` the patch
  defended against can no longer fire from this path.
"""

from __future__ import annotations

import json
import logging
import uuid

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Combined patch — _handle_single_event
# ---------------------------------------------------------------------------

_ORIGINAL_HANDLE_SINGLE_EVENT = None


def apply_handle_single_event_patch() -> None:  # noqa: C901
    """Monkey-patch ``LangGraphAgent._handle_single_event``.

    Fixes two upstream issues in a single patch:
      (a) OnToolEnd silently drops list-shaped / raw tool outputs (was a
          crash on ag-ui-langgraph <=0.0.33; on 0.0.35 it's a silent skip,
          which is functionally just as bad for MCP tool results).
      (b) OnChatModelStream drops Gemini content chunks (finish_reason bug
          is still present unconditionally on 0.0.35).

    Re-verified against ag-ui-langgraph 0.0.35 (see file-level docstring).

    WHEN TO REMOVE
    --------------
    - (a): when ag-ui handles list/raw outputs by iterating and emitting
      per-ToolMessage events (rather than the current silent-skip).
    - (b): when ag-ui fixes the finish_reason early-return for non-OpenAI
      models (e.g. checks for content/tool calls before returning).
    Once BOTH are fixed upstream, delete this entire function and its call
    in ``apply_all()``.
    """
    global _ORIGINAL_HANDLE_SINGLE_EVENT

    if _ORIGINAL_HANDLE_SINGLE_EVENT is not None:
        return

    try:
        from ag_ui_langgraph.agent import LangGraphAgent
        from ag_ui_langgraph.types import LangGraphEventTypes
    except ImportError:
        logger.debug(
            "ag_ui_langgraph not installed — skipping _handle_single_event patches"
        )
        return

    _ORIGINAL_HANDLE_SINGLE_EVENT = LangGraphAgent._handle_single_event

    async def _patched_handle_single_event(self, event, state):  # noqa: C901
        """Patched ``_handle_single_event`` that fixes two upstream bugs.

        1. OnChatModelStream: prevents Gemini content from being dropped
           when finish_reason is sent alongside content in the same chunk.
        2. OnToolEnd: handles list outputs, raw str/dict outputs, and single
           ToolMessages uniformly without crashing.

        All other event types are delegated to the original unchanged.
        """
        from ag_ui.core import (
            EventType,
            ToolCallArgsEvent,
            ToolCallEndEvent,
            ToolCallResultEvent,
            ToolCallStartEvent,
        )
        from ag_ui_langgraph.agent import dump_json_safe
        from ag_ui_langgraph.utils import (
            normalize_tool_content,
            resolve_message_content,
        )
        from langgraph.types import Command

        try:
            from langchain.schema import ToolMessage
        except ImportError:
            from langchain_core.messages import ToolMessage

        event_type = event.get("event")

        # =================================================================
        # FIX (b): OnChatModelStream — Gemini finish_reason + content
        # -----------------------------------------------------------------
        # WHY: Gemini sends the full response AND finish_reason in a single
        #      chunk. Upstream 0.0.35 still does (at agent.py:911-912):
        #          if response_metadata.get('finish_reason', None):
        #              return
        #      which silently drops the content. No TEXT_MESSAGE_* events
        #      are ever emitted.
        #
        # HOW: When finish_reason is present BUT the chunk also carries
        #      content or tool_call_chunks, we temporarily strip
        #      finish_reason so the original handler processes the content
        #      normally. We restore it afterwards to avoid side effects.
        #
        # REMOVE WHEN: ag-ui fixes the early return to check for content
        #              before skipping, or adds explicit Gemini support.
        # =================================================================
        if event_type == LangGraphEventTypes.OnChatModelStream:
            chunk = event["data"]["chunk"]

            # Mirrors upstream ag_ui_langgraph 0.0.35 ``_chunk_get`` accessor
            # (agent.py:903-906): chunks may arrive as plain dicts from some
            # LangChain providers/forwarders, not just BaseMessage instances.
            # Without this, dict chunks crashed before the Gemini fix ran.
            def _chunk_get(c, key, default=None):
                if isinstance(c, dict):
                    return c.get(key, default)
                return getattr(c, key, default)

            response_metadata = _chunk_get(chunk, "response_metadata", None) or {}
            finish_reason = response_metadata.get("finish_reason")

            if finish_reason:
                chunk_content = _chunk_get(chunk, "content", None)
                has_content = bool(chunk_content) and bool(
                    resolve_message_content(chunk_content)
                )
                has_tool_calls = bool(_chunk_get(chunk, "tool_call_chunks", None))

                if has_content or has_tool_calls:
                    # Strip finish_reason so the original handler processes
                    # this chunk normally instead of returning early. The
                    # resolved metadata is the same dict object regardless of
                    # chunk shape, so .pop() / item assignment hit the real
                    # object in both the dict and BaseMessage paths.
                    original_finish = response_metadata.pop("finish_reason")
                    try:
                        async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(
                            self, event, state
                        ):
                            yield evt
                    finally:
                        # Restore to avoid mutating the event permanently.
                        response_metadata["finish_reason"] = original_finish
                    return

            # No finish_reason, or finish_reason with no content — let
            # the original handler deal with it as usual.
            async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(self, event, state):
                yield evt
            return

        # =================================================================
        # Delegate all non-tool-end events to the original handler.
        # =================================================================
        if event_type != LangGraphEventTypes.OnToolEnd:
            async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(self, event, state):
                yield evt
            return

        # =================================================================
        # FIX (a): OnToolEnd — handle all output shapes
        # -----------------------------------------------------------------
        # WHY: Upstream 0.0.35 only handles single-ToolMessage and
        #      Command outputs. Anything else (list, raw str/dict) is
        #      logged-and-skipped at agent.py:1231-1236, which means the
        #      tool result never reaches the client. MCP tools (via
        #      langchain-mcp-adapters) return a **list** of ToolMessages,
        #      so MCP tool results disappear without this patch.
        #      (On <=0.0.33 the same paths crashed with AttributeError.)
        #
        # HOW: We check the output type and handle each shape:
        #      Case 1 — Command: extract ToolMessages from .update
        #      Case 2 — list: iterate over ToolMessage items
        #      Case 3 — single ToolMessage: emit directly
        #      Case 4 — raw str/dict/other: resolve tool_call_id from
        #               event metadata as fallback
        #
        # REMOVE WHEN: ag-ui handles list/raw outputs by emitting per-
        #   ToolMessage events instead of silently skipping
        #   (https://github.com/ag-ui-protocol/ag-ui/issues/1072).
        # =================================================================
        tool_call_output = event["data"]["output"]

        # -- Helper: emit AG-UI events for a single ToolMessage ------------
        def _emit_for_tool_msg(tool_msg):
            """Sync generator yielding AG-UI events for one ToolMessage."""
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

        # --- Case 1: Command — extract ToolMessages from Command.update ---
        if isinstance(tool_call_output, Command):
            update = tool_call_output.update or {}
            messages = update.get("messages", [])
            tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
            for tool_msg in tool_messages:
                for evt in _emit_for_tool_msg(tool_msg):
                    yield evt
            return

        # --- Case 2: List of outputs (silently skipped upstream — see Fix (a)) --
        if isinstance(tool_call_output, list):
            tool_messages = [m for m in tool_call_output if isinstance(m, ToolMessage)]
            for tool_msg in tool_messages:
                for evt in _emit_for_tool_msg(tool_msg):
                    yield evt
            return

        # --- Case 3: Single ToolMessage -----------------------------------
        if isinstance(tool_call_output, ToolMessage):
            for evt in _emit_for_tool_msg(tool_call_output):
                yield evt
            return

        # --- Case 4: Raw str/dict/other (no .tool_call_id attribute) ------
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
            parent_message_id = getattr(tool_call_output, "id", None) or tool_call_id
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
        "[idun patch] applied _handle_single_event patches: "
        "OnToolEnd list outputs (ag-ui#1072) + "
        "OnChatModelStream Gemini finish_reason fix"
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def apply_all() -> None:
    """Apply all ag-ui monkey patches. Call once at server startup.

    To remove a patch after the upstream fix is released:
    1. Delete the ``apply_*`` function and its helper.
    2. Remove its call below.
    3. Test with an MCP-tool agent via /agent/run.
    4. Test with a Gemini agent — confirm TEXT_MESSAGE_* events appear.
    """
    apply_handle_single_event_patch()
