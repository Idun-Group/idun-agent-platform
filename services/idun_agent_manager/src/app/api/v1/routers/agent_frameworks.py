"""Agent Framework API.

This router exposes endpoints to retrieve available agent frameworks.
"""

from fastapi import APIRouter
from idun_agent_schema.engine.agent_framework import AgentFramework

router = APIRouter()


@router.get(
    "/",
    response_model=list[str],
    summary="List available agent frameworks",
    description="Retrieve the list of supported agent frameworks in the platform.",
)
async def list_agent_frameworks() -> list[str]:
    """Return a list of supported agent frameworks.

    Returns:
        list[str]: List of agent framework identifiers (e.g., LANGGRAPH, ADK, etc.)
    """
    return [framework.value for framework in AgentFramework]
