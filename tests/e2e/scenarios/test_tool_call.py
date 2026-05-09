"""Scenario 3 — tool call (calculator). Asserts exactly one multiply tool call."""

import pytest

from tests.e2e.helpers.aguievents import (
    AGUIEvent,
    assert_envelope_complete,
    assert_response_contains,
    assert_tool_called_once,
)
from tests.e2e.helpers.run_client import post_run

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_calculator.py"
ADK_AGENT = "tests/e2e/fixtures/agents/agent_adk_with_tools.py"


def _assert_result_visible(events: list[AGUIEvent], substring: str) -> None:
    """Assert the substring appears in either text deltas or tool-call results.

    LangGraph adapters typically synthesize a final TEXT_MESSAGE_CONTENT
    after the tool returns, so the result lands in the streamed text.
    ADK+Gemini, however, frequently treats the TOOL_CALL_RESULT as the
    final response and never emits a follow-up text message — the result
    is still visible to an AG-UI consumer through the TOOL_CALL_RESULT
    ``content`` field. Accept either delivery shape.
    """
    text = "".join(
        e.get("delta", "") for e in events if e.get("type") == "TEXT_MESSAGE_CONTENT"
    )
    if substring in text:
        return
    tool_payloads = [
        str(e.get("content", "")) for e in events if e.get("type") == "TOOL_CALL_RESULT"
    ]
    combined = " ".join(tool_payloads)
    assert substring in combined, (
        f"expected substring {substring!r} not found in text response "
        f"({text!r}) or tool-call results ({combined!r})"
    )


@pytest.mark.pair("lg-openai", "lg-gemini")
def test_tool_call_langgraph_multiply(
    pair, render_config, standalone_with_config
) -> None:
    config = render_config(
        "lg_calculator.yaml.j2",
        port=0,
        agent_module_path=LG_AGENT,
    )
    with standalone_with_config(config) as base_url:
        events = post_run(
            base_url,
            "Use the multiply tool to compute 47 times 13. "
            "Reply with the integer result only.",
        )
    assert_envelope_complete(events)
    assert_tool_called_once(events, "multiply")
    assert_response_contains(events, "611")


@pytest.mark.pair("adk-gemini")
def test_tool_call_adk_multiply(pair, render_config, standalone_with_config) -> None:
    config = render_config(
        "adk_calculator.yaml.j2",
        port=0,
        agent_module_path=ADK_AGENT,
    )
    with standalone_with_config(config) as base_url:
        events = post_run(
            base_url,
            "Use the multiply tool to compute 47 times 13. "
            "Reply with the integer result only.",
        )
    assert_envelope_complete(events)
    assert_tool_called_once(events, "multiply")
    _assert_result_visible(events, "611")
