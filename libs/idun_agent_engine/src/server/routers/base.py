# Add a health check endpoint
from fastapi import APIRouter

from ..._version import __version__

base_router = APIRouter()


@base_router.get("/health")
def health_check():
    """Health check endpoint for monitoring and load balancers."""
    return {"status": "healthy", "engine_version": __version__}


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
