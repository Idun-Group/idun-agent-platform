"""Dependency injection helpers for FastAPI routes."""

import logging

from fastapi import HTTPException, Request, status
from idun_agent_schema.engine.capabilities import AgentCapabilities

from ..core.config_builder import ConfigBuilder
from ..mcp import MCPClientRegistry

logger = logging.getLogger(__name__)


async def get_agent(request: Request):
    """Return the pre-initialized agent instance from the app state.

    Returns ``503 agent_not_ready`` when the engine booted unconfigured
    and ``configure_app`` has not yet been called (e.g. the standalone
    is in admin-only mode while the user finishes the onboarding wizard).
    Falls back to loading from the default config only when
    ``app.state.agent`` was never set at all — the legacy test path
    where lifespan didn't run.
    """
    if hasattr(request.app.state, "agent"):
        agent = request.app.state.agent
        if agent is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": {
                        "code": "agent_not_ready",
                        "message": (
                            "Agent has not been configured yet. "
                            "Complete onboarding or call configure_app() "
                            "to bring the agent online."
                        ),
                    }
                },
            )
        return agent

    # Legacy fallback for cases where the lifespan event did not run,
    # like some testing scenarios. Embedders running unconfigured set
    # ``app.state.agent = None`` in lifespan, so ``hasattr`` returns
    # True for them and we raise 503 above instead of reaching this.
    logger.warning("⚠️ Agent not found in app state, initializing fallback agent...")

    app_config = ConfigBuilder.load_from_file()
    agent = await ConfigBuilder.initialize_agent_from_config(app_config)
    return agent


async def get_copilotkit_agent(request: Request):
    """Return the pre-initialized agent instance from the app state.

    Falls back to loading from the default config if not present (e.g., tests).
    """
    if hasattr(request.app.state, "copilotkit_agent"):
        return request.app.state.copilotkit_agent
    else:
        # This is a fallback for cases where the lifespan event did not run,
        # like in some testing scenarios.
        # Consider logging a warning here.
        logger.warning(
            "⚠️ CopilotKit agent not found in app state, initializing fallback agent..."
        )

        app_config = ConfigBuilder.load_from_file()
        copilotkit_agent = await ConfigBuilder.initialize_agent_from_config(app_config)
        return copilotkit_agent


async def get_capabilities(request: Request) -> AgentCapabilities:
    """Return cached agent capabilities from app state."""
    capabilities = getattr(request.app.state, "capabilities", None)
    if capabilities is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent capabilities not yet initialized",
        )
    return capabilities


def get_mcp_registry(request: Request) -> MCPClientRegistry:
    """Return the configured MCP registry if available."""
    registry: MCPClientRegistry | None = getattr(
        request.app.state, "mcp_registry", None
    )
    if registry is None or not registry.enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP servers are not configured for this engine.",
        )
    return registry
