"""Minimal Google ADK agent. Observability lives entirely in config.yaml."""

from google.adk.agents import Agent


root_agent = Agent(
    model="gemini-2.5-flash",
    name="observability_adk",
    description="ADK agent with Langfuse traces configured at the engine layer.",
    instruction="You are a friendly assistant. Be concise.",
)
