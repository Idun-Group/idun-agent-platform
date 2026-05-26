"""ADK agent whose instruction is loaded from a managed prompt.

``get_prompt(...)`` reads from the engine's in-memory prompts registry,
populated by the standalone (or the engine's own bootstrap) from the
``prompts:`` block in ``config.yaml`` before this file is imported.
"""

from google.adk.agents import Agent
from idun_agent_engine.prompts import get_prompt


instruction = get_prompt("system-prompt").format(role="customer support agent")


root_agent = Agent(
    model="gemini-2.5-flash",
    name="prompts_adk",
    description="ADK agent whose instruction comes from a managed prompt.",
    instruction=instruction,
)
