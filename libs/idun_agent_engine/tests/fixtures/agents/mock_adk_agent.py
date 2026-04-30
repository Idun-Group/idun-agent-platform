from google.adk.agents import (
    BaseAgent,
    LlmAgent,
    LoopAgent,
    ParallelAgent,
    SequentialAgent,
)
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

# -----------------------------------------------------------------------------
# Workflow agent fixtures — sequential, parallel, loop
# -----------------------------------------------------------------------------

mock_seq_step_a = LlmAgent(name="seq_a", model="gemini-2.5-flash", instruction="A")
mock_seq_step_b = LlmAgent(name="seq_b", model="gemini-2.5-flash", instruction="B")
mock_seq_step_c = LlmAgent(name="seq_c", model="gemini-2.5-flash", instruction="C")
mock_sequential_agent = SequentialAgent(
    name="seq_root",
    sub_agents=[mock_seq_step_a, mock_seq_step_b, mock_seq_step_c],
)

mock_par_a = LlmAgent(name="par_a", model="gemini-2.5-flash", instruction="A")
mock_par_b = LlmAgent(name="par_b", model="gemini-2.5-flash", instruction="B")
mock_parallel_agent = ParallelAgent(
    name="par_root", sub_agents=[mock_par_a, mock_par_b]
)

mock_loop_step = LlmAgent(name="loop_step", model="gemini-2.5-flash", instruction="L")
mock_loop_agent = LoopAgent(
    name="loop_root",
    sub_agents=[mock_loop_step],
    max_iterations=5,
)

# Nested: root LlmAgent with a SequentialAgent sub-agent + native tool
mock_nested_inner_a = LlmAgent(
    name="inner_a", model="gemini-2.5-flash", instruction="ia"
)
mock_nested_inner_b = LlmAgent(
    name="inner_b", model="gemini-2.5-flash", instruction="ib"
)
mock_nested_seq = SequentialAgent(
    name="inner_seq",
    sub_agents=[mock_nested_inner_a, mock_nested_inner_b],
)
mock_nested_root = LlmAgent(
    name="nested_root",
    model="gemini-2.5-flash",
    instruction="root",
    tools=[_native_func],
    sub_agents=[mock_nested_seq],
)

# Custom subclass — reuse MockADKAgent already defined above.
mock_custom_root = MockADKAgent(
    name="custom_root",
    description="Custom subclass for graph IR test",
)
