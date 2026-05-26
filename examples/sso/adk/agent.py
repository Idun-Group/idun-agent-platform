"""Minimal Google ADK agent. SSO enforcement lives entirely in config.yaml."""

from google.adk.agents import Agent


root_agent = Agent(
    model="gemini-2.5-flash",
    name="sso_adk",
    description="ADK chatbot protected by OIDC SSO at the engine layer.",
    instruction="You are a friendly assistant. Be concise.",
)
