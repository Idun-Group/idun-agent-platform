"""Scenario 9 — Jinja prompt templating. System prompt set at boot
must reach the LLM, evidenced by a deterministic injected token in
the response."""

import contextlib
import os

import pytest

from tests.e2e.helpers.aguievents import (
    assert_response_contains,
    assert_response_non_empty,
)
from tests.e2e.scenarios.test_chat_happy_path import _post_run

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_chat.py"

INJECTED_TOKEN = "MARKER-Z9X3"


@contextlib.contextmanager
def _set_system_prompt(value: str):
    """Temporarily set E2E_SYSTEM_PROMPT in os.environ so the standalone
    subprocess (which inherits {**os.environ, ...overrides}) sees it.

    Restored on context exit.
    """
    prev = os.environ.get("E2E_SYSTEM_PROMPT")
    os.environ["E2E_SYSTEM_PROMPT"] = value
    try:
        yield
    finally:
        if prev is None:
            os.environ.pop("E2E_SYSTEM_PROMPT", None)
        else:
            os.environ["E2E_SYSTEM_PROMPT"] = prev


@pytest.mark.pair("lg-openai", "lg-gemini")
def test_prompt_templating_includes_token(
    pair, render_config, standalone_with_config
) -> None:
    config = render_config(
        "lg_chat.yaml.j2",
        port=0,
        agent_module_path=LG_AGENT,
        system_prompt=None,
        checkpointer_db=None,
    )
    sys_prompt = (
        f"You always end every reply with the token {INJECTED_TOKEN}. "
        "Reply in one short sentence."
    )
    with _set_system_prompt(sys_prompt):
        with standalone_with_config(config) as base_url:
            events = _post_run(base_url, "Say hi.")
    assert_response_non_empty(events)
    assert_response_contains(events, INJECTED_TOKEN)
