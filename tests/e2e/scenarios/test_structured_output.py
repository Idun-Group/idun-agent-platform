"""Scenario 8 — structured output. Response parses against a JSON schema."""

import json
import re

import jsonschema
import pytest

from tests.e2e.helpers.aguievents import assert_response_non_empty
from tests.e2e.scenarios.test_chat_happy_path import _post_run

LG_AGENT = "tests/e2e/fixtures/agents/agent_lg_chat.py"


SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "age": {"type": "integer", "minimum": 0, "maximum": 200},
    },
    "required": ["name", "age"],
    "additionalProperties": False,
}


@pytest.mark.pair("lg-openai", "lg-gemini")
def test_structured_output_validates(
    pair, render_config, standalone_with_config
) -> None:
    """Ask the LLM for a JSON object matching SCHEMA; validate it parses.

    The instruction is delivered via the user message rather than a system
    prompt: the current LG chat fixture does not wire the engine config's
    `prompts.system` field into the LLM call. Putting the schema directive
    in the user turn is sufficient for structured-output coverage and
    avoids cross-cutting fixture changes.
    """
    config = render_config(
        "lg_chat.yaml.j2",
        port=0,
        agent_module_path=LG_AGENT,
        system_prompt=None,
        checkpointer_db=None,
    )
    user_msg = (
        "Reply with a JSON object EXACTLY matching this schema and nothing "
        'else: {"name": "<string>", "age": <int>}. '
        "The person's name is Alice and her age is 30. "
        "No code fences. No prose. Reply with the JSON object only."
    )
    with standalone_with_config(config) as base_url:
        events = _post_run(base_url, user_msg)
    text = assert_response_non_empty(events)
    # LLMs sometimes wrap output in code fences despite the instruction;
    # extract the first JSON object regardless of surrounding markup.
    json_blob = re.search(r"\{.*\}", text, flags=re.DOTALL)
    assert json_blob, f"no JSON object found in response: {text!r}"
    parsed = json.loads(json_blob.group(0))
    jsonschema.validate(parsed, SCHEMA)
    assert parsed["name"].lower() == "alice", f"unexpected name: {parsed!r}"
    assert parsed["age"] == 30, f"unexpected age: {parsed!r}"
