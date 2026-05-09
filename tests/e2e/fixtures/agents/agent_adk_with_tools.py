"""ADK agent with FunctionTool calculator.

Mirror of agent_lg_calculator.py but using ADK's FunctionTool API
instead of LangChain @tool decorator. The instruction is firm about
tool use — Gemini sometimes computes inline if not pushed.
"""

import os

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool


def add(a: int, b: int) -> int:
    """Return a + b."""
    return a + b


def multiply(a: int, b: int) -> int:
    """Return a * b."""
    return a * b


def _make() -> LlmAgent:
    model = os.environ.get("E2E_MODEL", "gemini-3-flash-preview")
    instruction = (
        "You are a calculator. When the user asks for arithmetic, "
        "ALWAYS call the appropriate tool. Reply with the integer "
        "result only, nothing else."
    )
    return LlmAgent(
        name="e2e_adk_tools",
        model=model,
        instruction=instruction,
        tools=[FunctionTool(add), FunctionTool(multiply)],
    )


root_agent: LlmAgent = _make()
