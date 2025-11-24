"""AGUI routes for CopilotKit integration with LangGraph agents."""

import logging
from typing import Annotated

from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from fastapi import APIRouter, Depends, HTTPException, Request

from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
from idun_agent_engine.server.dependencies import get_agent

logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def setup_agui_router(app, agent: LanggraphAgent) -> None:
    """Set up AGUI routes for CopilotKit integration.

    This function adds the LangGraph agent as a CopilotKit-compatible endpoint.

    Args:
        app: The FastAPI application instance
        agent: The initialized LangGraph agent instance
    """
    try:
        # Get the compiled graph from the agent
        graph = agent.agent_instance

        # Create the AGUI agent wrapper
        agui_agent = LangGraphAGUIAgent(
            name=agent.name or "idun_agent",
            description=f"Idun Agent Engine - {agent.name}",
            graph=graph,
        )

        # Add the LangGraph FastAPI endpoint
        add_langgraph_fastapi_endpoint(
            app=app,
            agent=agui_agent,
            path="agent/agui/stream",
        )

        logger.info(f"✅ AGUI endpoint configured at /agui for agent: {agent.name}")
    except Exception as e:
        logger.error(f"❌ Failed to setup AGUI router: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to setup AGUI router: {e}") from e
