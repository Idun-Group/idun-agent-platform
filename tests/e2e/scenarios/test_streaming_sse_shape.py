"""Scenario 2 — streaming SSE shape. Asserts AG-UI event sequence."""

import pytest

from tests.e2e.helpers.aguievents import (
    assert_envelope_complete,
    assert_event_sequence,
)
from tests.e2e.scenarios.test_chat_happy_path import AGENT_MODULE, _post_run


@pytest.mark.pair("lg-openai", "lg-gemini")
def test_streaming_sse_shape_langgraph(
    pair, render_config, standalone_with_config
) -> None:
    config = render_config(
        "lg_chat.yaml.j2",
        port=0,
        agent_module_path=AGENT_MODULE,
        system_prompt="Reply in one short sentence.",
        checkpointer_db=None,
    )
    with standalone_with_config(config) as base_url:
        events = _post_run(base_url, "Hi.")
    assert_envelope_complete(events)
    assert_event_sequence(
        events,
        [
            "RUN_STARTED",
            "TEXT_MESSAGE_START",
            "TEXT_MESSAGE_CONTENT+",
            "TEXT_MESSAGE_END",
            "RUN_FINISHED",
        ],
    )
