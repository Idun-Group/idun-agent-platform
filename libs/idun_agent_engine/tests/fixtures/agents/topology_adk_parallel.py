"""ADK: ParallelAgent fanning out to 3 specialists — multi-perspective analysis."""
from google.adk.agents import LlmAgent, ParallelAgent

financial = LlmAgent(name="financial_analyst", model="gemini-2.0-flash",
                     instruction="Analyze financial aspects.")
legal = LlmAgent(name="legal_analyst", model="gemini-2.0-flash",
                 instruction="Analyze legal aspects.")
technical = LlmAgent(name="technical_analyst", model="gemini-2.0-flash",
                     instruction="Analyze technical aspects.")

root_agent = ParallelAgent(
    name="multi_perspective",
    sub_agents=[financial, legal, technical],
)
