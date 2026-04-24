"""Base routes for service health and landing info."""

import inspect
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..._version import __version__
from ...core.config_builder import ConfigBuilder
from ..lifespan import cleanup_agent, configure_app

logger = logging.getLogger(__name__)

base_router = APIRouter()


class ReloadRequest(BaseModel):
    """Request body for reload endpoint."""

    path: str | None = None


async def _reload_auth_dep(request: Request) -> None:
    """Resolve the optional /reload auth dependency from app state.

    When ``app.state.reload_auth`` is ``None`` (the default), this is a
    no-op so ``/reload`` remains unprotected for backwards compatibility.
    Otherwise the callable is invoked; it is expected to raise
    :class:`fastapi.HTTPException` on rejection. Both sync and async
    callables are supported.
    """
    auth = getattr(request.app.state, "reload_auth", None)
    if auth is None:
        return None
    result = auth()
    if inspect.isawaitable(result):
        await result
    return None


@base_router.get("/health")
def health_check(request: Request):
    """Health check endpoint for monitoring and load balancers."""
    agent = getattr(request.app.state, "agent", None)
    configuration = getattr(agent, "configuration", None)
    agent_name = getattr(configuration, "name", None)
    # TODO: return managed agent UUID (from manager API response) for stronger
    # identity validation. Currently agent_name is the only shared identifier.
    return {
        "status": "ok",
        "service": "idun-agent-engine",
        "version": __version__,
        "agent_name": agent_name,
    }


@base_router.post("/reload")
async def reload_config(
    request: Request,
    body: ReloadRequest | None = None,
    _auth: None = Depends(_reload_auth_dep),
):
    """Reload the agent configuration from the manager or a file.

    The optional ``_auth`` dependency consults
    ``app.state.reload_auth`` (configured via ``create_app(reload_auth=...)``)
    and, if set, invokes it. The configured callable is responsible for
    raising :class:`fastapi.HTTPException` to deny the request.
    """
    try:
        if body and body.path:
            logger.info(f"🔄 Reloading configuration from file: {body.path}...")
            new_config = ConfigBuilder.load_from_file(body.path)
        else:
            logger.info("🔄 Reloading configuration from manager...")
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

    except HTTPException:
        raise

    except Exception as e:
        logger.exception(f"❌ Error reloading configuration: {e}")
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
