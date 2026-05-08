"""Scenario 4 — multi-turn referencing. Judge-asserted on all 3 pairs."""

import uuid
from pathlib import Path
from typing import Any

import httpx
import pytest

from tests.e2e.helpers.aguievents import (
    assert_envelope_complete,
    assert_response_non_empty,
    parse_sse_lines,
)
from tests.e2e.helpers.judge import judge

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_chat.py"
ADK_AGENT = "tests/e2e/fixtures/agents/agent_adk_chat.py"


def _post_run_with_thread(base_url: str, *, thread_id: str, message: str) -> str:
    body: dict[str, Any] = {
        "threadId": thread_id,
        "runId": str(uuid.uuid4()),
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
            events = parse_sse_lines(r.iter_lines())
    assert_envelope_complete(events)
    return assert_response_non_empty(events)


@pytest.mark.pair("lg-openai", "lg-gemini")
def test_multi_turn_langgraph_judge(
    pair, render_config, standalone_with_config, tmp_path: Path
) -> None:
    db_path = tmp_path / "checkpoint.db"
    config = render_config(
        "lg_with_checkpointer.yaml.j2",
        port=0,
        agent_module_path=LG_AGENT,
        checkpointer_db=str(db_path),
        system_prompt="You are a careful assistant. Reply in one sentence.",
    )
    with standalone_with_config(config) as base_url:
        thread = str(uuid.uuid4())
        turn1_user = "My favorite color is teal."
        turn1_resp = _post_run_with_thread(
            base_url, thread_id=thread, message=turn1_user
        )
        turn2_user = "What did I just tell you about my favorite color?"
        turn2_resp = _post_run_with_thread(
            base_url, thread_id=thread, message=turn2_user
        )
    verdict = judge(
        rubric=(
            "Does the agent's reply correctly recall that the user's "
            "favorite color is teal? Reply YES or NO."
        ),
        response=turn2_resp,
        turn1_user=turn1_user,
        turn1_assistant=turn1_resp,
        turn2_user=turn2_user,
    )
    assert verdict, f"judge said NO; turn2 response: {turn2_resp!r}"


@pytest.mark.pair("adk-gemini")
def test_multi_turn_adk_judge(
    pair, render_config, standalone_with_config, tmp_path: Path
) -> None:
    config = render_config(
        "adk_with_session.yaml.j2",
        port=0,
        agent_module_path=ADK_AGENT,
        model=pair["model"],
    )
    with standalone_with_config(config) as base_url:
        thread = str(uuid.uuid4())
        turn1 = "My favorite color is teal."
        r1 = _post_run_with_thread(base_url, thread_id=thread, message=turn1)
        r2 = _post_run_with_thread(
            base_url,
            thread_id=thread,
            message="What did I just tell you about my favorite color?",
        )
    assert judge(
        rubric=(
            "Does the agent's reply correctly recall that the user's "
            "favorite color is teal? Reply YES or NO."
        ),
        response=r2,
        turn1_user=turn1,
        turn1_assistant=r1,
    )
