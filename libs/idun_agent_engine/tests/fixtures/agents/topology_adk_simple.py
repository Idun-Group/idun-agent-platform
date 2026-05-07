"""ADK: simple LlmAgent, no tools, no sub-agents."""
from google.adk.agents import LlmAgent

root_agent = LlmAgent(
    name="chat_agent",
    model="gemini-2.0-flash",
    instruction="You are a helpful assistant.",
    description="A simple chat agent.",
)
