"""ADK: realistic nested topology — coordinator with sub-agents that have tools.

Mirrors the example from §4 of the spec: a customer support agent with billing
and tech support sub-agents, each carrying their own tools.
"""
from google.adk.agents import LlmAgent
from google.adk.tools import google_search


def search_faq(query: str) -> str:
    """Search the FAQ knowledge base."""
    return f"FAQ result for: {query}"


def issue_refund(amount: float, reason: str) -> str:
    """Issue a customer refund."""
    return f"Refunded ${amount} for: {reason}"


def create_ticket(subject: str, priority: str = "normal") -> str:
    """Create a support ticket."""
    return f"Ticket created: {subject} (priority: {priority})"


billing = LlmAgent(
    name="billing_agent",
    model="gemini-2.0-flash",
    instruction="Handle billing questions and refunds.",
    description="Billing and refunds specialist.",
    tools=[issue_refund],
)

tech_support = LlmAgent(
    name="tech_support_agent",
    model="gemini-2.0-flash",
    instruction="Handle technical issues. Create tickets for unresolved problems.",
    description="Technical support specialist.",
    tools=[create_ticket, google_search],
)

root_agent = LlmAgent(
    name="support_coordinator",
    model="gemini-2.0-flash",
    instruction="Route customer questions to the right specialist.",
    description="Customer support coordinator.",
    tools=[search_faq],
    sub_agents=[billing, tech_support],
)
