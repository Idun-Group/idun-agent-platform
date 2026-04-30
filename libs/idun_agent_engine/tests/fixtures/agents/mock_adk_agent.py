from google.adk.agents import BaseAgent, LlmAgent
from google.adk.events import Event
from google.genai.types import Content, Part
from pydantic import BaseModel


class AdkTaskRequest(BaseModel):
    """Custom input model for testing ADK structured input."""

    task_name: str
    priority: int = 1
    tags: list[str] = []


class MockADKAgent(BaseAgent):
    async def _run_async_impl(self, ctx):
        user_content = ctx.user_content if hasattr(ctx, "user_content") else "test"
        content_str = str(user_content) if user_content else "test"

        response_content = Content(parts=[Part(text=f"Response to: {content_str}")])
        yield Event(author="mock_agent", content=response_content)


mock_adk_agent_instance = MockADKAgent(
    name="mock_agent", description="A mock ADK agent for testing without LLM calls."
)

# -----------------------------------------------------------------------------
# Fixtures for graph IR tests
# -----------------------------------------------------------------------------

# Simple LlmAgent, no tools, no sub-agents
mock_llm_simple = LlmAgent(
    name="simple",
    model="gemini-2.5-flash",
    instruction="You are a test agent.",
    description="A simple test agent.",
)


def _native_func(x: str) -> str:
    """A plain function tool."""
    return x


# LlmAgent with one native function tool
mock_llm_with_native_tool = LlmAgent(
    name="with_native",
    model="gemini-2.5-flash",
    instruction="You are a test agent.",
    tools=[_native_func],
)
