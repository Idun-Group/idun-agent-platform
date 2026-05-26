"""Minimal Google ADK agent. The Slack integration lives entirely in config.yaml."""

from google.adk.agents import Agent


root_agent = Agent(
    model="gemini-2.5-flash",
    name="integrations_adk",
    description="ADK chatbot exposed as a Slack bot at the engine layer.",
    instruction="You are a friendly assistant. Be concise.",
)
