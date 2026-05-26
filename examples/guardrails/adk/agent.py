"""Minimal Google ADK agent. The guardrails live in config.yaml."""

from google.adk.agents import Agent


root_agent = Agent(
    model="gemini-2.5-flash",
    name="guardrails_adk",
    description="ADK agent with input + output guardrails configured at the engine layer.",
    instruction="You are a friendly assistant. Be concise.",
)
