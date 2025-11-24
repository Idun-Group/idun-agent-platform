# """AGUI routes for CopilotKit integration with LangGraph agents."""

# import logging
# from typing import Annotated

# from ag_ui_langgraph import add_langgraph_fastapi_endpoint
# from copilotkit import LangGraphAGUIAgent
# from ag_ui_adk import ADKAgent as ADKAGUIAgent
# from ag_ui_adk import add_adk_fastapi_endpoint
# from fastapi import APIRouter, Depends, HTTPException, Request

# from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
# from idun_agent_engine.agent.adk.adk import AdkAgent
# from idun_agent_engine.server.dependencies import get_agent

# logging.basicConfig(
#     format="%(asctime)s %(levelname)-8s %(message)s",
#     level=logging.INFO,
#     datefmt="%Y-%m-%d %H:%M:%S",
# )

# logger = logging.getLogger(__name__)


# def setup_agui_router(app, agent: LanggraphAgent | AdkAgent) -> LangGraphAGUIAgent | ADKAGUIAgent:
#     """Set up AGUI routes for CopilotKit integration.

#     This function adds the LangGraph agent as a CopilotKit-compatible endpoint.

#     Args:
#         app: The FastAPI application instance
#         agent: The initialized LangGraph agent instance
#     """
#     try:
#         if isinstance(agent, LanggraphAgent):
#             # Create the AGUI agent wrapper
#             agui_agent = agent.copilotkit_agent_instance
#         elif isinstance(agent, AdkAgent):
#             # Create the AGUI agent wrapper
#                 agui_agent = agent.copilotkit_agent_instance # TODO: duplicate in agent.adk.adk.py init
#         else:
#             raise ValueError(f"Unsupported agent type: {type(agent)}")
#         return agui_agent
#         logger.info(f"✅ AGUI endpoint configured at /agui for agent: {agent.name}")
#     except Exception as e:
#         logger.error(f"❌ Failed to setup AGUI router: {e}")
#         raise HTTPException(status_code=500, detail=f"Failed to setup AGUI router: {e}") from e
