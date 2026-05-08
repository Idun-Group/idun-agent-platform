"""Binary YES/NO LLM-as-judge helper for the e2e suite.

Used by exactly one scenario: multi-turn referencing (#4). Calls
gpt-5.4-mini with temperature=0 and asserts a strict YES/NO reply.
Any ambiguity raises AssertionError with the judge's full reply
captured.
"""
from __future__ import annotations

import os

from openai import OpenAI

JUDGE_MODEL = "gpt-5.4-mini"
JUDGE_SYSTEM = (
    "You are a strict test judge. You will be given a YES/NO rubric "
    "and the actual content from an AI agent. Reply with exactly one "
    "word: YES or NO. No explanation, no punctuation, no markdown."
)


def _parse_verdict(reply: str) -> bool:
    """Return True if reply is YES (case-insensitive), False if NO; else AssertionError."""
    s = reply.strip().upper()
    if s == "YES":
        return True
    if s == "NO":
        return False
    raise AssertionError(
        f"Judge returned ambiguous verdict {reply!r}; expected YES or NO."
    )


def judge(rubric: str, *, response: str, **context: str) -> bool:
    """Single OpenAI call asking the judge to evaluate `rubric` against `response`.

    Extra `context` items are appended to the user message as labeled fields,
    e.g. `judge(rubric=..., response=resp, turn1_user="...", turn1_assistant="...")`.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    assert api_key, "judge() requires OPENAI_API_KEY"
    client = OpenAI(api_key=api_key)

    body_parts = [f"RUBRIC: {rubric}", "", f"AGENT_RESPONSE:\n{response}"]
    for label, value in context.items():
        body_parts.extend(["", f"{label.upper()}:\n{value}"])
    user_msg = "\n".join(body_parts)

    completion = client.chat.completions.create(
        model=JUDGE_MODEL,
        temperature=0,
        max_tokens=8,
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
    )
    reply = (completion.choices[0].message.content or "").strip()
    return _parse_verdict(reply)
