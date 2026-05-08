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
    "You are a strict test judge. Evaluate the rubric ONLY against "
    "the AGENT_RESPONSE block. Any other labeled blocks (TURN1_USER, "
    "TURN1_ASSISTANT, TURN2_USER, etc.) are conversational context "
    "that the agent SHOULD have remembered; they are NOT evidence of "
    "what the agent actually said. If the AGENT_RESPONSE itself does "
    "not satisfy the rubric, answer NO even when the missing fact "
    "appears verbatim in the context blocks. "
    "Reply with exactly one word: YES or NO. "
    "No explanation, no punctuation, no markdown."
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
    if not api_key:
        raise RuntimeError("judge() requires OPENAI_API_KEY")
    client = OpenAI(api_key=api_key)

    body_parts = [f"RUBRIC: {rubric}", "", f"AGENT_RESPONSE:\n{response}"]
    for label, value in context.items():
        body_parts.extend(["", f"{label.upper()}:\n{value}"])
    user_msg = "\n".join(body_parts)

    completion = client.chat.completions.create(
        model=JUDGE_MODEL,
        temperature=0,
        # SPEC §8.2 allows 50. gpt-5.x rejects the legacy `max_tokens`
        # param and may emit reasoning tokens that count against this
        # budget, so a tight cap (e.g. 8) can return an empty content
        # string with a length-stop. 50 is enough headroom while still
        # surfacing model drift if the reply balloons.
        max_completion_tokens=50,
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
    )
    reply = (completion.choices[0].message.content or "").strip()
    return _parse_verdict(reply)
