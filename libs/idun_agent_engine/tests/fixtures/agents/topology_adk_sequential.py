"""ADK: SequentialAgent orchestrating 3 LlmAgents — content pipeline."""
from google.adk.agents import LlmAgent, SequentialAgent

researcher = LlmAgent(
    name="researcher",
    model="gemini-2.0-flash",
    instruction="Research the topic and gather facts.",
)

writer = LlmAgent(
    name="writer",
    model="gemini-2.0-flash",
    instruction="Write an article from the research notes.",
)

editor = LlmAgent(
    name="editor",
    model="gemini-2.0-flash",
    instruction="Edit the article for clarity and tone.",
)

root_agent = SequentialAgent(
    name="content_pipeline",
    sub_agents=[researcher, writer, editor],
)
