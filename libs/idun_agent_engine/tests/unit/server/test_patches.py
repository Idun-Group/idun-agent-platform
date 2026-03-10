"""Tests for server monkey patches (idempotency, correctness)."""

import pytest


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


@pytest.mark.unit
def test_apply_prepare_stream_patch_is_idempotent():
    """Applying the prepare_stream patch twice must not wrap the wrapper."""
    from ag_ui_langgraph.agent import LangGraphAgent

    from idun_agent_engine.server import patches
    from idun_agent_engine.server.patches import apply_prepare_stream_patch

    apply_prepare_stream_patch()
    original_after_first = patches._ORIGINAL_PREPARE_STREAM

    apply_prepare_stream_patch()

    assert patches._ORIGINAL_PREPARE_STREAM is original_after_first
    assert patches._ORIGINAL_PREPARE_STREAM is not LangGraphAgent.prepare_stream
