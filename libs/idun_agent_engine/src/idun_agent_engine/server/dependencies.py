"""Dependency injection helpers for FastAPI routes."""

from fastapi import HTTPException, Request, status

from ..core.config_builder import ConfigBuilder
from ..mcp import MCPClientRegistry


async def get_agent(request: Request):
    """Return the pre-initialized agent instance from the app state.

    Falls back to loading from the default config if not present (e.g., tests).
    """
    if hasattr(request.app.state, "agent"):
        return request.app.state.agent
    else:
        # This is a fallback for cases where the lifespan event did not run,
        # like in some testing scenarios.
        # Consider logging a warning here.
        print("⚠️  Agent not found in app state, initializing fallback agent...")

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
        print(
            "⚠️  CopilotKit agent not found in app state, initializing fallback agent..."
        )

        app_config = ConfigBuilder.load_from_file()
        copilotkit_agent = await ConfigBuilder.initialize_agent_from_config(app_config)
        return copilotkit_agent


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
