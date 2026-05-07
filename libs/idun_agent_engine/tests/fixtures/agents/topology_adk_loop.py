"""ADK: LoopAgent for iterative refinement — critic/reviser pair."""
from google.adk.agents import LlmAgent, LoopAgent

critic = LlmAgent(
    name="critic",
    model="gemini-2.0-flash",
    instruction="Critique the current draft and suggest improvements.",
)

reviser = LlmAgent(
    name="reviser",
    model="gemini-2.0-flash",
    instruction="Apply the critic's feedback to revise the draft.",
)

root_agent = LoopAgent(
    name="critic_reviser_loop",
    sub_agents=[critic, reviser],
    max_iterations=3,
)
