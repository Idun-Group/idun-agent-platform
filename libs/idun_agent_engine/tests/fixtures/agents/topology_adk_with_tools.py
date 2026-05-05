"""ADK: LlmAgent with native + built-in tools."""
from google.adk.agents import LlmAgent
from google.adk.tools import google_search


def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"Weather in {city}: sunny, 72F"


def get_time(timezone: str = "UTC") -> str:
    """Get the current time in a timezone."""
    return f"Current time ({timezone}): 14:00"


root_agent = LlmAgent(
    name="info_agent",
    model="gemini-2.0-flash",
    instruction="Answer questions using your tools.",
    description="An info-finding agent.",
    tools=[get_weather, get_time, google_search],
)
