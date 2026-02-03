from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai.types import Content, Part


class MockADKAgent(BaseAgent):
    async def _run_async_impl(self, ctx):
        user_content = ctx.user_content if hasattr(ctx, "user_content") else "test"
        content_str = str(user_content) if user_content else "test"

        response_content = Content(parts=[Part(text=f"Response to: {content_str}")])
        yield Event(author="mock_agent", content=response_content)


mock_adk_agent_instance = MockADKAgent(
    name="mock_agent", description="A mock ADK agent for testing without LLM calls."
)
