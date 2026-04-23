"""ADK agent with Skills (SkillToolset) example.

Demonstrates an ADK agent that uses the Skills feature to load
domain-specific expertise on demand. Skills follow the open
Agent Skills specification (agentskills.io) and support
progressive disclosure to minimize context window usage.

The skills are defined inline in the config.yaml and injected
automatically by the Idun Agent Engine.
"""

from google.adk.agents import LlmAgent

root_agent = LlmAgent(
    name="skills_agent",
    model="gemini-2.0-flash",
    instruction=(
        "You are a helpful assistant with access to specialized skills. "
        "When a user's request matches a skill's domain, use `load_skill` "
        "to load the detailed instructions for that skill before responding. "
        "Always follow the loaded skill instructions precisely."
    ),
)
