from google.adk.agents import LlmAgent
from idun_agent_engine.mcp.helpers import get_adk_tools_from_api, get_adk_tools_from_file
from pathlib import Path
import os

os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"
os.environ["GOOGLE_CLOUD_PROJECT"] = "chat-appsheet-prd"
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"  # e.g., us-central1

# Display the values after setting them
print("GOOGLE_GENAI_USE_VERTEXAI:", os.environ.get("GOOGLE_GENAI_USE_VERTEXAI"))
print("GOOGLE_CLOUD_PROJECT:", os.environ.get("GOOGLE_CLOUD_PROJECT"))
print("GOOGLE_CLOUD_LOCATION:", os.environ.get("GOOGLE_CLOUD_LOCATION"))

# Mock tool implementation
def get_current_time(city: str) -> dict:
    """Returns the current time in a specified city."""
    return {"status": "success", "city": city, "time": "10:30 AM"}


idun_tools = get_adk_tools_from_api() # type: ignore
tools = [get_current_time] + idun_tools

root_agent = LlmAgent(
    model='gemini-2.5-flash',
    name='root_agent',
    description="Tells the current time in a specified city.",
    instruction="You are a helpful assistant that tells the current time in cities. Use the 'get_current_time' tool for this purpose.",
    tools=tools, # type: ignore
)
