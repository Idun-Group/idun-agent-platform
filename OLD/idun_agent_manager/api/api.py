from fastapi import APIRouter
from idun_agent_manager.api.endpoints import agents

api_router = APIRouter()
api_router.include_router(agents.router, prefix="/agents", tags=["Agents"])
