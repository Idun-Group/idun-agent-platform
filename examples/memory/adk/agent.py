"""ADK chatbot with persistent session state via a SQLAlchemy db_url.

The session_service block in config.yaml configures ADK's
DatabaseSessionService against a local SQLite file. Sessions
identified by the same thread_id survive process restarts.
"""

from google.adk.agents import Agent


root_agent = Agent(
    model="gemini-2.5-flash",
    name="memory_adk",
    description="ADK chatbot whose sessions persist to a local SQLite file.",
    instruction="You are a friendly assistant. Be concise.",
)
