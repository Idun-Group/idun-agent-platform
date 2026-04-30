"""Tests for server monkey patches (idempotency + behavioral correctness)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_apply_handle_single_event_patch_is_idempotent():
    """Applying the monkey patch twice must not cause infinite recursion.

    Regression test for the bug where a second call to
    apply_handle_single_event_patch() captured the already-patched function
    as the "original", creating _patched -> _original(== _patched) -> ...
    infinite recursion.
    """
    from ag_ui_langgraph.agent import LangGraphAgent

    from idun_agent_engine.server import patches
    from idun_agent_engine.server.patches import apply_handle_single_event_patch

    apply_handle_single_event_patch()
    original_after_first = patches._ORIGINAL_HANDLE_SINGLE_EVENT

    apply_handle_single_event_patch()

    assert patches._ORIGINAL_HANDLE_SINGLE_EVENT is original_after_first
    assert (
        patches._ORIGINAL_HANDLE_SINGLE_EVENT is not LangGraphAgent._handle_single_event
    )


# ---------------------------------------------------------------------------
# Behavioral tests for _handle_single_event patch
# ---------------------------------------------------------------------------


def _make_patched_agent_stub() -> Any:
    """Build a minimal stub agent with the bits ``_patched_handle_single_event``
    touches (active_run + _dispatch_event passthrough).

    We avoid constructing a real LangGraphAgent because that requires a
    compiled graph and full ag-ui bootstrap. The patched method only reads
    ``self.active_run`` and calls ``self._dispatch_event``, so a SimpleNamespace
    is sufficient.
    """
    agent = SimpleNamespace()
    agent.active_run = {
        "id": "run-id-1",
        # has_function_streaming=False forces start/args/end + result emission
        # (rather than result-only), which is what the patch is asserting.
        "has_function_streaming": False,
    }
    # Identity dispatch so we can inspect the events emitted directly.
    agent._dispatch_event = lambda evt: evt
    return agent


async def _drain(async_gen) -> list:
    out = []
    async for item in async_gen:
        out.append(item)
    return out


@pytest.mark.unit
@pytest.mark.asyncio
async def test_on_tool_end_list_output_emits_per_tool_message_events():
    """Fix (a): a list of ToolMessage outputs must emit one TOOL_CALL_RESULT
    per ToolMessage. Upstream 0.0.35 silently skips lists; this patch is
    what makes MCP tool responses (which return lists) reach the client.
    """
    from ag_ui.core import EventType
    from ag_ui_langgraph.agent import LangGraphAgent
    from ag_ui_langgraph.types import LangGraphEventTypes
    from langchain_core.messages import ToolMessage

    from idun_agent_engine.server.patches import apply_handle_single_event_patch

    apply_handle_single_event_patch()

    agent = _make_patched_agent_stub()
    tool_messages = [
        ToolMessage(content="result-1", tool_call_id="tc-1", name="lookup", id="m-1"),
        ToolMessage(content="result-2", tool_call_id="tc-2", name="lookup", id="m-2"),
    ]
    event = {
        "event": LangGraphEventTypes.OnToolEnd,
        "data": {"output": tool_messages, "input": {"query": "x"}},
    }

    events = await _drain(
        LangGraphAgent._handle_single_event(agent, event, state={})
    )

    # has_function_streaming=False → start/args/end + result for each msg = 4 per msg
    result_events = [e for e in events if e.type == EventType.TOOL_CALL_RESULT]
    assert len(result_events) == 2
    assert {e.tool_call_id for e in result_events} == {"tc-1", "tc-2"}

    # Regression-proof against a result-only emission: with
    # has_function_streaming=False the patch must also emit the
    # TOOL_CALL_START / TOOL_CALL_END pair per ToolMessage.
    start_events = [e for e in events if e.type == EventType.TOOL_CALL_START]
    end_events = [e for e in events if e.type == EventType.TOOL_CALL_END]
    assert len(start_events) == 2
    assert len(end_events) == 2
    assert {e.tool_call_id for e in start_events} == {"tc-1", "tc-2"}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_on_tool_end_raw_dict_output_resolves_tool_call_id_from_metadata():
    """Fix (a) Case 4: raw dict outputs (no .tool_call_id attribute) must
    fall back to event metadata to recover the tool_call_id rather than
    being silently dropped.
    """
    from ag_ui.core import EventType
    from ag_ui_langgraph.agent import LangGraphAgent
    from ag_ui_langgraph.types import LangGraphEventTypes

    from idun_agent_engine.server.patches import apply_handle_single_event_patch

    apply_handle_single_event_patch()

    agent = _make_patched_agent_stub()
    event = {
        "event": LangGraphEventTypes.OnToolEnd,
        "name": "search",
        "metadata": {"langgraph_tool_call_id": "tc-from-meta"},
        "data": {"output": {"hits": ["a", "b"]}, "input": {"q": "test"}},
    }

    events = await _drain(
        LangGraphAgent._handle_single_event(agent, event, state={})
    )

    result_events = [
        e for e in events if getattr(e, "type", None) == EventType.TOOL_CALL_RESULT
    ]
    assert len(result_events) == 1
    assert result_events[0].tool_call_id == "tc-from-meta"

    # Regression-proof against a result-only emission: with
    # has_function_streaming=False the patch must also emit the
    # TOOL_CALL_START / TOOL_CALL_END pair around the single result.
    start_events = [
        e for e in events if getattr(e, "type", None) == EventType.TOOL_CALL_START
    ]
    end_events = [
        e for e in events if getattr(e, "type", None) == EventType.TOOL_CALL_END
    ]
    assert len(start_events) == 1
    assert len(end_events) == 1


@pytest.mark.unit
@pytest.mark.asyncio
async def test_on_chat_model_stream_strips_finish_reason_when_content_present():
    """Fix (b): when a chunk carries BOTH finish_reason AND content (the
    Gemini case), the patch must strip finish_reason and let the chunk
    flow through the original handler so TEXT_MESSAGE_* events fire.
    """
    from ag_ui_langgraph.agent import LangGraphAgent
    from ag_ui_langgraph.types import LangGraphEventTypes

    from idun_agent_engine.server import patches
    from idun_agent_engine.server.patches import apply_handle_single_event_patch

    apply_handle_single_event_patch()

    # Replace the captured original with a sentinel-yielding spy so we can
    # assert (1) it was called and (2) the chunk's finish_reason was None
    # at the moment of the call.
    seen_finish_reasons = []

    async def _spy_original(self, event, state):
        seen_finish_reasons.append(
            event["data"]["chunk"].response_metadata.get("finish_reason")
        )
        yield "delegated"

    original_backup = patches._ORIGINAL_HANDLE_SINGLE_EVENT
    patches._ORIGINAL_HANDLE_SINGLE_EVENT = _spy_original
    try:
        agent = _make_patched_agent_stub()
        chunk = MagicMock()
        chunk.response_metadata = {"finish_reason": "STOP"}
        chunk.content = "hello world"
        chunk.tool_call_chunks = []
        event = {
            "event": LangGraphEventTypes.OnChatModelStream,
            "data": {"chunk": chunk},
        }

        events = await _drain(
            LangGraphAgent._handle_single_event(agent, event, state={})
        )

        # The original handler was invoked exactly once, and it saw
        # finish_reason cleared (proof the patch stripped it).
        assert seen_finish_reasons == [None]
        assert events == ["delegated"]
        # And the patch restored finish_reason on the chunk afterwards.
        assert chunk.response_metadata["finish_reason"] == "STOP"
    finally:
        patches._ORIGINAL_HANDLE_SINGLE_EVENT = original_backup


@pytest.mark.unit
@pytest.mark.asyncio
async def test_on_chat_model_stream_passes_through_when_no_finish_reason():
    """Sanity check: when no finish_reason is present, the patch must
    still delegate to the original handler unchanged.
    """
    from ag_ui_langgraph.agent import LangGraphAgent
    from ag_ui_langgraph.types import LangGraphEventTypes

    from idun_agent_engine.server import patches
    from idun_agent_engine.server.patches import apply_handle_single_event_patch

    apply_handle_single_event_patch()

    call_count = 0

    async def _spy_original(self, event, state):
        nonlocal call_count
        call_count += 1
        yield "passthrough"

    original_backup = patches._ORIGINAL_HANDLE_SINGLE_EVENT
    patches._ORIGINAL_HANDLE_SINGLE_EVENT = _spy_original
    try:
        agent = _make_patched_agent_stub()
        chunk = MagicMock()
        chunk.response_metadata = {}
        chunk.content = "partial"
        chunk.tool_call_chunks = []
        event = {
            "event": LangGraphEventTypes.OnChatModelStream,
            "data": {"chunk": chunk},
        }

        events = await _drain(
            LangGraphAgent._handle_single_event(agent, event, state={})
        )

        assert call_count == 1
        assert events == ["passthrough"]
    finally:
        patches._ORIGINAL_HANDLE_SINGLE_EVENT = original_backup
