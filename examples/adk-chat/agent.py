"""Simple ADK chat agent example.

Demonstrates a basic ADK agent without input/output schemas.
The engine auto-discovers this as a chat-mode agent.
"""

from google.adk.agents import LlmAgent

root_agent = LlmAgent(
    name="chat_agent",
    model="gemini-2.0-flash",
    instruction="You are a helpful assistant. Respond concisely.",
)
