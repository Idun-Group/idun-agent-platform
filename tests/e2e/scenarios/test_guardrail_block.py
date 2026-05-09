"""Scenario 5 — input PII guardrail blocks the request with HTTP 429."""

from __future__ import annotations

import os
import uuid
from typing import Any

import httpx
import pytest

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_chat.py"


def _post_run_status(base_url: str, message: str) -> int:
    body: dict[str, Any] = {
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
@pytest.mark.xfail(
    strict=False,
    reason=(
        "DETECT_PII boot-time install via the Guardrails Hub is unstable in "
        "CI: the engine's lifespan parses the YAML guardrail block but the "
        "DetectPII validator's transitive deps (presidio-analyzer + a spaCy "
        "model such as en_core_web_lg) are not bootstrapped in the CI runner, "
        "so the guard fails to construct yet boot continues — PII-laden "
        "requests then flow through with 200 instead of 429. Same upstream "
        "issue as test_reload_pipeline.py. Tracked in idun-dev roadmap T1: "
        "'Engine Hub-install error handling in reload pipeline'. Locally with "
        "those deps installed the test passes — strict=False keeps that "
        "signal without forcing a green CI."
    ),
)
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
