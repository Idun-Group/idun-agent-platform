"""Scenario 5 — input PII guardrail blocks the request with HTTP 429."""

from __future__ import annotations

import os
import uuid
from typing import TypedDict

import httpx
import pytest

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_chat.py"


class _RunMessage(TypedDict):
    id: str
    role: str
    content: str


class _RunRequestPayload(TypedDict):
    threadId: str
    runId: str
    messages: list[_RunMessage]
    tools: list[object]
    context: list[object]
    state: dict[str, object]
    forwardedProps: dict[str, object]


def _post_run_status(base_url: str, message: str) -> int:
    body: _RunRequestPayload = {
        "threadId": str(uuid.uuid4()),
        "runId": str(uuid.uuid4()),
        "messages": [
            {"id": str(uuid.uuid4()), "role": "user", "content": message},
        ],
        "tools": [],
        "context": [],
        "state": {},
        "forwardedProps": {},
    }
    with httpx.Client(timeout=60.0) as client:
        with client.stream(
            "POST",
            f"{base_url}/agent/run",
            json=body,
            headers={"Accept": "text/event-stream"},
        ) as r:
            # Drain the body so the connection releases cleanly even on 200.
            for _ in r.iter_lines():
                pass
            return r.status_code


@pytest.mark.pair("lg-openai")
def test_guardrail_blocks_pii(pair, render_config, standalone_with_config) -> None:
    if not os.environ.get("GUARDRAILS_API_KEY"):
        pytest.skip(
            "GUARDRAILS_API_KEY not set — DETECT_PII guard install requires "
            "guardrails-ai hub credentials."
        )

    config = render_config(
        "lg_with_guardrail.yaml.j2",
        port=0,
        agent_module_path=LG_AGENT,
    )
    with standalone_with_config(config) as base_url:
        clean_status = _post_run_status(base_url, "Hello there.")
        blocked_status = _post_run_status(
            base_url,
            "Send the report to user@example.com please.",
        )
    assert clean_status == 200, f"clean prompt returned {clean_status}"
    assert blocked_status == 429, f"PII prompt returned {blocked_status}, expected 429"
