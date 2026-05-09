"""Scenario 3 — tool call (calculator). Asserts exactly one multiply tool call."""

import pytest

from tests.e2e.helpers.aguievents import (
    assert_envelope_complete,
    assert_response_contains,
    assert_tool_called_once,
)
from tests.e2e.helpers.run_client import post_run

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_calculator.py"


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
