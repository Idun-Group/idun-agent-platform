"""Scenario 1 — chat happy path. Runs on all 3 pairs."""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import pytest

from tests.e2e.helpers.aguievents import (
    AGUIEvent,
    assert_envelope_complete,
    assert_response_non_empty,
    parse_sse_lines,
)

AGENT_MODULE = "tests/e2e/fixtures/agents/agent_lg_chat.py"
ADK_AGENT_MODULE = "tests/e2e/fixtures/agents/agent_adk_chat.py"


def _post_run(base_url: str, message: str) -> list[AGUIEvent]:
    thread_id = str(uuid.uuid4())
    run_id = str(uuid.uuid4())
    body: dict[str, Any] = {
        "threadId": thread_id,
        "runId": run_id,
        "messages": [
            {"id": str(uuid.uuid4()), "role": "user", "content": message},
        ],
        "tools": [],
        "context": [],
        "state": {},
        "forwardedProps": {},
    }
    with httpx.Client(timeout=120.0) as client:
        with client.stream(
            "POST",
            f"{base_url}/agent/run",
            json=body,
            headers={"Accept": "text/event-stream"},
        ) as r:
            assert r.status_code == 200, r.read()
            return parse_sse_lines(r.iter_lines())


@pytest.mark.pair("lg-openai", "lg-gemini")
def test_chat_happy_path_langgraph(pair, render_config, standalone_with_config) -> None:
    config = render_config(
        "lg_chat.yaml.j2",
        port=0,  # The fixture passes the real port via IDUN_PORT.
        agent_module_path=AGENT_MODULE,
        system_prompt="You are a precise assistant. Reply in one sentence.",
        checkpointer_db=None,
    )
    with standalone_with_config(config) as base_url:
        events = _post_run(base_url, "Say hello in one short sentence.")
    assert_envelope_complete(events)
    text = assert_response_non_empty(events)
    assert len(text) < 400, f"expected short reply, got {len(text)} chars"


@pytest.mark.pair("adk-gemini")
def test_chat_happy_path_adk(pair, render_config, standalone_with_config) -> None:
    config = render_config(
        "adk_chat.yaml.j2",
        port=0,
        agent_module_path=ADK_AGENT_MODULE,
        model=pair["model"],
    )
    with standalone_with_config(config) as base_url:
        events = _post_run(base_url, "Say hello in one short sentence.")
    assert_envelope_complete(events)
    assert_response_non_empty(events)
