"""Scenario 7 — admin REST adds an input guardrail; subsequent chat
matching the guard is blocked with 429. Tests the full
admin-REST -> commit_with_reload -> engine pickup pipeline.

Pivoted from prompt-persona-change in design (see SPEC §5 row 7
design note). Also preserves guardrail-block coverage now that
Tasks 2.4 + 2.5 are deferred due to the standalone seeder gap.
"""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import pytest

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_chat.py"

# Deterministic sentinel: an unusual token that the agent's response is
# unlikely to emit on its own and that's safe to ban.
SENTINEL = "qwertanu"


def _send_chat_status(base_url: str, message: str) -> int:
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
        r = client.post(
            f"{base_url}/agent/run",
            json=body,
            headers={"Accept": "text/event-stream"},
        )
        return r.status_code


@pytest.mark.pair("lg-openai")
def test_reload_pipeline_adds_input_guardrail(
    pair, render_config, standalone_with_config
) -> None:
    config = render_config(
        "lg_chat.yaml.j2",
        port=0,
        agent_module_path=LG_AGENT,
        system_prompt="Reply in one short sentence.",
        checkpointer_db=None,
    )
    with standalone_with_config(config) as base_url:
        # Pre-reload: chat with the sentinel word succeeds (no guardrail).
        pre = _send_chat_status(base_url, f"Please greet me. ({SENTINEL})")
        assert pre == 200, f"expected 200 pre-reload, got {pre}"

        # Add an input BAN_LIST guard that bans the sentinel.
        # Outer envelope (StandaloneGuardrailCreate) uses camelCase aliases;
        # the inner ``guardrail`` is a ManagerGuardrailConfig (plain BaseModel,
        # snake_case). See libs/idun_agent_schema/src/idun_agent_schema/
        # standalone/guardrails.py and manager/guardrail_configs.py.
        body = {
            "name": "e2e-ban-sentinel",
            "position": "input",
            "enabled": True,
            "guardrail": {
                "config_id": "ban_list",
                "banned_words": [SENTINEL],
            },
        }
        r = httpx.post(
            f"{base_url}/admin/api/v1/guardrails",
            json=body,
            timeout=60.0,
        )
        assert r.status_code in (
            200,
            201,
        ), f"admin POST failed: {r.status_code} {r.text!r}"
        payload = r.json()
        # Mutation envelope carries reload status; confirm the engine picked
        # the new config up rather than queueing for restart.
        reload_status = (payload.get("reload") or {}).get("status")
        assert (
            reload_status == "reloaded"
        ), f"expected reload.status=reloaded, got {reload_status} ({payload!r})"

        # Post-reload: identical chat now blocked.
        post = _send_chat_status(base_url, f"Please greet me. ({SENTINEL})")
        assert post == 429, f"expected 429 post-reload, got {post}"

        # Sanity: a chat WITHOUT the sentinel still passes (rules out a
        # "guardrails always block" false positive).
        clean = _send_chat_status(base_url, "Please greet me.")
        assert clean == 200, f"clean message returned {clean}, expected 200"
