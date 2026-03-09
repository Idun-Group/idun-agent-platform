"""Monkey patches for third-party ag-ui / copilotkit bugs.

Each patch targets a specific upstream issue. When the upstream fix is released,
remove the corresponding ``apply_*`` function **and** its call in ``apply_all()``.

HOW TO VERIFY REMOVAL IS SAFE
------------------------------
1. Remove the patch.
2. Run an agent that uses MCP tools via the /agent/copilotkit/stream endpoint.
3. Trigger a tool call and confirm the stream completes without errors.
4. For the Gemini patch: send a simple chat message and confirm TEXT_MESSAGE_*
   events appear in the stream (not just RAW events).
5. For the prepare_stream patch: send 2+ messages in the same thread and confirm
   the second message streams without ``ValueError: Message ID not found``.

PATCHES
-------
1. ``apply_handle_single_event_patch``
   Combines two fixes into a single ``_handle_single_event`` monkey-patch:

   a) **OnToolEnd — list / raw tool outputs**
      - Upstream bug: ``_handle_single_event`` assumes ``event["data"]["output"]``
        on ``OnToolEnd`` is always a single ``ToolMessage``. When the tool node
        returns a **list** (e.g. from MCP tools), accessing ``.tool_call_id``
        on the list raises ``AttributeError``.
      - Error: ``AttributeError: 'list' object has no attribute 'tool_call_id'``
      - Upstream issue: https://github.com/ag-ui-protocol/ag-ui/issues/1072
      - Upstream PRs: https://github.com/ag-ui-protocol/ag-ui/pull/1073
                       https://github.com/ag-ui-protocol/ag-ui/pull/1164
      - Fix: when ``tool_call_output`` is a list, iterate over its ToolMessage
        items. When it is a raw str/dict, resolve ``tool_call_id`` from event
        metadata.

   b) **OnChatModelStream — Gemini finish_reason drops content**
      - Upstream bug: the very first line of the ``OnChatModelStream`` handler
        does ``if chunk.response_metadata.get('finish_reason'): return``.
        Gemini models (e.g. gemini-2.5-flash) send the **entire response +
        finish_reason in a single chunk**. The early return discards the
        content, so no ``TEXT_MESSAGE_START/CONTENT/END`` events are emitted.
      - Symptom: the agent's text response only appears in RAW events and
        MESSAGES_SNAPSHOT, never as proper TEXT_MESSAGE_* events.
      - Upstream issue: not yet filed (ag-ui assumes OpenAI-style streaming
        where finish_reason arrives on a separate empty chunk).
      - Fix: only skip the chunk when ``finish_reason`` is set **and** there
        is no content and no tool call data. When content IS present, we
        temporarily strip ``finish_reason`` from response_metadata before
        delegating to the original handler, then restore it.

2. ``apply_prepare_stream_patch``
   Fixes false-positive "regenerate" detection in ``prepare_stream``.

   - Upstream bug: ``prepare_stream`` decides a request is a "regenerate"
     (time-travel) whenever the checkpoint has more messages than the client
     sent. It then looks up the client's last message ID in the checkpoint
     history. When IDs don't match (client sends only new messages, or uses
     ephemeral IDs like ``"preview"``), ``get_checkpoint_before_message``
     raises ``ValueError("Message ID not found in history")``.
   - Error: ``ValueError: Message ID not found in history``
   - Symptom: the 2nd+ message in a thread crashes the stream with a 500.
   - Based on: ag-ui-langgraph v0.0.25
   - Fix: wrap the ``prepare_regenerate_stream`` call in a try/except. On
     ``ValueError``, fall through to the normal (non-regenerate) stream path.
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

    Fixes two upstream bugs in a single patch:
      (a) OnToolEnd crashes on list / raw tool outputs  (ag-ui#1072)
      (b) OnChatModelStream drops Gemini content chunks (finish_reason bug)

    WHEN TO REMOVE
    --------------
    - (a): when ag-ui merges a fix for https://github.com/ag-ui-protocol/ag-ui/issues/1072
    - (b): when ag-ui fixes the finish_reason early-return for non-OpenAI models
    Once BOTH are fixed upstream, delete this entire function and its call in
    ``apply_all()``.
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
        #      chunk. The original handler does:
        #          if chunk.response_metadata.get('finish_reason'): return
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
            finish_reason = chunk.response_metadata.get("finish_reason")

            if finish_reason:
                has_content = chunk.content and resolve_message_content(chunk.content)
                has_tool_calls = bool(chunk.tool_call_chunks)

                if has_content or has_tool_calls:
                    # Strip finish_reason so the original handler processes
                    # this chunk normally instead of returning early.
                    original_finish = chunk.response_metadata.pop("finish_reason")
                    try:
                        async for evt in _ORIGINAL_HANDLE_SINGLE_EVENT(
                            self, event, state
                        ):
                            yield evt
                    finally:
                        # Restore to avoid mutating the event permanently.
                        chunk.response_metadata["finish_reason"] = original_finish
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
        # WHY: The original handler assumes tool_call_output is always a
        #      single ToolMessage and accesses .tool_call_id directly.
        #      MCP tools (via langchain-mcp-adapters) return a **list** of
        #      ToolMessages, and some tools return raw str/dict. Both crash.
        #
        # HOW: We check the output type and handle each shape:
        #      Case 1 — Command: extract ToolMessages from .update
        #      Case 2 — list: iterate over ToolMessage items
        #      Case 3 — single ToolMessage: emit directly
        #      Case 4 — raw str/dict/other: resolve tool_call_id from
        #               event metadata as fallback
        #
        # REMOVE WHEN: ag-ui merges a fix for
        #   https://github.com/ag-ui-protocol/ag-ui/issues/1072
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

        # --- Case 2: List of outputs (BUG — upstream crashes here) --------
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
# Patch 2 — prepare_stream: false-positive regenerate detection
# ---------------------------------------------------------------------------

_ORIGINAL_PREPARE_STREAM = None


def apply_prepare_stream_patch() -> None:  # noqa: C901
    """Monkey-patch ``LangGraphAgent.prepare_stream``.

    Fixes false-positive "regenerate" detection that crashes multi-turn
    conversations with ``ValueError: Message ID not found in history``.

    The upstream ``prepare_stream`` compares checkpoint message count to
    the client's non-system message count.  When the checkpoint has more
    (which happens on the 2nd+ message because it includes AI responses),
    it enters the regenerate path and tries to find the client's message
    ID in the checkpoint history.  If the IDs don't match (client sends
    only new messages, or uses ephemeral IDs), the lookup raises.

    The fix wraps the ``prepare_regenerate_stream`` call in a try/except.
    On ``ValueError`` the method falls through to the normal stream path.

    WHEN TO REMOVE
    --------------
    When ag-ui-langgraph handles message-ID mismatches gracefully in
    ``prepare_stream`` or ``get_checkpoint_before_message``.
    Based on ag-ui-langgraph v0.0.25.
    """
    global _ORIGINAL_PREPARE_STREAM

    if _ORIGINAL_PREPARE_STREAM is not None:
        return

    try:
        from ag_ui_langgraph.agent import LangGraphAgent
    except ImportError:
        logger.debug("ag_ui_langgraph not installed — skipping prepare_stream patch")
        return

    _ORIGINAL_PREPARE_STREAM = LangGraphAgent.prepare_stream

    async def _patched_prepare_stream(self, input, agent_state, config):
        """Patched ``prepare_stream`` — catches false-positive regenerate.

        Identical to the original except the ``prepare_regenerate_stream``
        call is wrapped in try/except ValueError.  When the message ID is
        not found in checkpoint history the method falls through to the
        normal (non-regenerate) stream path instead of crashing.
        """
        from ag_ui.core import (
            CustomEvent,
            EventType,
            RunFinishedEvent,
            RunStartedEvent,
        )
        from ag_ui_langgraph.agent import dump_json_safe
        from ag_ui_langgraph.types import LangGraphEventTypes
        from ag_ui_langgraph.utils import (
            agui_messages_to_langchain,
            get_stream_payload_input,
        )
        from langchain_core.messages import HumanMessage, SystemMessage
        from langgraph.types import Command

        state_input = input.state or {}
        messages = input.messages or []
        forwarded_props = input.forwarded_props or {}
        thread_id = input.thread_id

        state_input["messages"] = agent_state.values.get("messages", [])
        self.active_run["current_graph_state"] = agent_state.values.copy()
        langchain_messages = agui_messages_to_langchain(messages)
        state = self.langgraph_default_merge_state(
            state_input, langchain_messages, input
        )
        self.active_run["current_graph_state"].update(state)
        config["configurable"]["thread_id"] = thread_id
        interrupts = (
            agent_state.tasks[0].interrupts
            if agent_state.tasks and len(agent_state.tasks) > 0
            else []
        )
        has_active_interrupts = len(interrupts) > 0
        resume_input = forwarded_props.get("command", {}).get("resume", None)

        self.active_run["schema_keys"] = self.get_schema_keys(config)

        non_system_messages = [
            msg for msg in langchain_messages if not isinstance(msg, SystemMessage)
        ]
        if len(agent_state.values.get("messages", [])) > len(non_system_messages):
            last_user_message = None
            for i in range(len(langchain_messages) - 1, -1, -1):
                if isinstance(langchain_messages[i], HumanMessage):
                    last_user_message = langchain_messages[i]
                    break

            if last_user_message:
                # ---- BEGIN IDUN FIX ----
                # Wrap in try/except: when the client's message ID doesn't
                # exist in the checkpoint history this is NOT a real
                # regenerate request — fall through to the normal path.
                try:
                    result = await self.prepare_regenerate_stream(
                        input=input,
                        message_checkpoint=last_user_message,
                        config=config,
                    )
                    if result is not None:
                        return result
                except ValueError:
                    logger.warning(
                        "[idun patch] Message ID %s not found in checkpoint "
                        "history — treating as new message (not regenerate)",
                        last_user_message.id,
                    )
                # ---- END IDUN FIX ----

        events_to_dispatch = []
        if has_active_interrupts and not resume_input:
            events_to_dispatch.append(
                RunStartedEvent(
                    type=EventType.RUN_STARTED,
                    thread_id=thread_id,
                    run_id=self.active_run["id"],
                )
            )

            for interrupt in interrupts:
                events_to_dispatch.append(
                    CustomEvent(
                        type=EventType.CUSTOM,
                        name=LangGraphEventTypes.OnInterrupt.value,
                        value=dump_json_safe(interrupt.value),
                        raw_event=interrupt,
                    )
                )

            events_to_dispatch.append(
                RunFinishedEvent(
                    type=EventType.RUN_FINISHED,
                    thread_id=thread_id,
                    run_id=self.active_run["id"],
                )
            )
            return {
                "stream": None,
                "state": None,
                "config": None,
                "events_to_dispatch": events_to_dispatch,
            }

        if self.active_run["mode"] == "continue":
            await self.graph.aupdate_state(
                config, state, as_node=self.active_run.get("node_name")
            )

        if resume_input:
            if isinstance(resume_input, str):
                try:
                    resume_input = json.loads(resume_input)
                except json.JSONDecodeError:
                    pass
            stream_input = Command(resume=resume_input)
        else:
            payload_input = get_stream_payload_input(
                mode=self.active_run["mode"],
                state=state,
                schema_keys=self.active_run["schema_keys"],
            )
            stream_input = (
                {**forwarded_props, **payload_input} if payload_input else None
            )

        subgraphs_stream_enabled = (
            input.forwarded_props.get("stream_subgraphs")
            if input.forwarded_props
            else False
        )

        kwargs = self.get_stream_kwargs(
            input=stream_input,
            config=config,
            subgraphs=bool(subgraphs_stream_enabled),
            version="v2",
        )

        stream = self.graph.astream_events(**kwargs)

        return {
            "stream": stream,
            "state": state,
            "config": config,
        }

    LangGraphAgent.prepare_stream = _patched_prepare_stream

    logger.info(
        "[idun patch] applied prepare_stream patch: "
        "false-positive regenerate detection (Message ID not found)"
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
    4. Test with a Gemini agent — confirm TEXT_MESSAGE_* events appear.
    5. Test multi-turn conversations — confirm 2nd+ messages stream OK.
    """
    apply_handle_single_event_patch()
    apply_prepare_stream_patch()
