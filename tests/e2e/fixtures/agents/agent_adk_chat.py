"""ADK minimal agent — Gemini-backed LlmAgent, no tools.

Note: no `from __future__ import annotations` — engine module loader
incompatibility (Phase 1.7 fix).
"""

import os

from google.adk.agents import LlmAgent


def _make() -> LlmAgent:
    model = os.environ.get("E2E_MODEL", "gemini-3-flash-preview")
    instruction = os.environ.get(
        "E2E_SYSTEM_PROMPT",
        "You are a precise assistant. Reply in one sentence.",
    )
    return LlmAgent(
        name="e2e_adk_chat",
        model=model,
        instruction=instruction,
    )


root_agent: LlmAgent = _make()
