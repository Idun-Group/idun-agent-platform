"""Base routes for service health and landing info."""

import os
from typing import Optional
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from ..._version import __version__
from ...core.config_builder import ConfigBuilder
from ..lifespan import cleanup_agent, configure_app

base_router = APIRouter()


class ReloadRequest(BaseModel):
    """Request body for reload endpoint."""

    path: Optional[str] = None


@base_router.get("/health")
def health_check():
    """Health check endpoint for monitoring and load balancers."""
    return {"status": "healthy", "engine_version": __version__}


@base_router.post("/reload")
async def reload_config(request: Request, body: Optional[ReloadRequest] = None):
    """Reload the agent configuration from the manager or a file."""

    try:
        if body and body.path:
            print(f"🔄 Reloading configuration from file: {body.path}...")
            new_config = ConfigBuilder.load_from_file(body.path)
        else:
            print("🔄 Reloading configuration from manager...")
            agent_api_key = os.getenv("IDUN_AGENT_API_KEY")
            manager_host = os.getenv("IDUN_MANAGER_HOST")

            if not agent_api_key or not manager_host:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot reload from manager: IDUN_AGENT_API_KEY or IDUN_MANAGER_HOST environment variables are missing.",
                )

            # Fetch new config
            config_builder = ConfigBuilder().with_config_from_api(
                agent_api_key=agent_api_key, url=manager_host
            )
            new_config = config_builder.build()

        # Cleanup old agent
        await cleanup_agent(request.app)

        # Initialize new agent
        await configure_app(request.app, new_config)

        return {
            "status": "success",
            "message": "Agent configuration reloaded successfully",
        }

    except Exception as e:
        print(f"❌ Error reloading configuration: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to reload configuration: {str(e)}"
        )


# Add a root endpoint with helpful information
@base_router.get("/")
def read_root():
    """Root endpoint with basic information about the service."""
    return {
        "message": "Welcome to your Idun Agent Engine server!",
        "docs": "/docs",
        "health": "/health",
        "agent_endpoints": {"invoke": "/agent/invoke", "stream": "/agent/stream"},
    }


# # Add info endpoint for detailed server and agent information
# @base_router.get("/info")
# def get_info(request: Request):
#     """Get detailed information about the server and loaded agent."""
#     info = {
#         "engine": {
#             "name": "Idun Agent Engine",
#             "version": __version__,
#             "description": "A framework for building and deploying conversational AI agents"
#         },
#         "server": {
#             "status": "running",
#             "endpoints": {
#                 "health": "/health",
#                 "docs": "/docs",
#                 "redoc": "/redoc",
#                 "agent_invoke": "/agent/invoke",
#                 "agent_stream": "/agent/stream"
#             }
#         }
#     }

#     # Add agent information if available in app state
#     if hasattr(request.app.state, "config") and request.app.state.config:
#         config = request.app.state.config
#         info["agent"] = {
#             "type": config.agent.type,
#             "name": config.agent.config.get("name", "Unknown"),
#             "status": "loaded"
#         }
#         info["server"]["port"] = config.server.api.port

#     return info
