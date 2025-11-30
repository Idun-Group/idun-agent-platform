"""Dependency injection helpers for FastAPI routes."""

from fastapi import HTTPException, Request, status

from ..core.config_builder import ConfigBuilder
from ..core.logging_config import get_logger, log_operation
from ..mcp import MCPClientRegistry

logger = get_logger("dependencies")


async def get_agent(request: Request):
    """Return the pre-initialized agent instance from the app state.

    Falls back to loading from the default config if not present (e.g., tests).
    """
    if hasattr(request.app.state, "agent"):
        agent = request.app.state.agent
        agent_id = getattr(agent, 'id', None)
        agent_type = getattr(agent, 'agent_type', None)
        agent_name = getattr(agent, 'name', None)

        log_operation(
            logger, "DEBUG", "agent_retrieved", "Agent retrieved from app state",
            agent_id=agent_id,
            agent_type=agent_type,
            agent_name=agent_name
        )
        return agent
    else:
        log_operation(
            logger, "WARNING", "agent_fallback", "Agent not found in app state, initializing fallback agent"
        )

        try:
            app_config = ConfigBuilder.load_from_file()
            agent = await ConfigBuilder.initialize_agent_from_config(app_config)

            agent_id = getattr(agent, 'id', None)
            agent_type = getattr(agent, 'agent_type', None)
            agent_name = getattr(agent, 'name', None)

            log_operation(
                logger, "INFO", "fallback_agent_initialized", "Fallback agent initialized successfully",
                agent_id=agent_id,
                agent_type=agent_type,
                agent_name=agent_name
            )
            return agent
        except Exception as e:
            log_operation(
                logger, "ERROR", "fallback_agent_failed", "Failed to initialize fallback agent",
                error_type=type(e).__name__,
                error_details=str(e)
            )
            raise

async def get_copilotkit_agent(request: Request):
    """Return the pre-initialized agent instance from the app state.

    Falls back to loading from the default config if not present (e.g., tests).
    """
    if hasattr(request.app.state, "copilotkit_agent"):
        copilotkit_agent = request.app.state.copilotkit_agent

        log_operation(
            logger, "DEBUG", "copilotkit_agent_retrieved", "CopilotKit agent retrieved from app state"
        )
        return copilotkit_agent
    else:
        log_operation(
            logger, "WARNING", "copilotkit_agent_fallback", "CopilotKit agent not found in app state, initializing fallback agent"
        )

        try:
            app_config = ConfigBuilder.load_from_file()
            copilotkit_agent = await ConfigBuilder.initialize_agent_from_config(app_config)

            log_operation(
                logger, "INFO", "fallback_copilotkit_agent_initialized", "Fallback CopilotKit agent initialized successfully"
            )
            return copilotkit_agent
        except Exception as e:
            log_operation(
                logger, "ERROR", "fallback_copilotkit_agent_failed", "Failed to initialize fallback CopilotKit agent",
                error_type=type(e).__name__,
                error_details=str(e)
            )
            raise


def get_mcp_registry(request: Request) -> MCPClientRegistry:
    """Return the configured MCP registry if available."""
    registry: MCPClientRegistry | None = getattr(request.app.state, "mcp_registry", None)

    if registry is None or not registry.enabled:
        log_operation(
            logger, "WARNING", "mcp_registry_not_available", "MCP registry not configured or disabled"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP servers are not configured for this engine.",
        )

    log_operation(
        logger, "DEBUG", "mcp_registry_retrieved", "MCP registry retrieved successfully",
        server_list=", ".join(registry.available_servers()) if registry.enabled else "none"
    )
    return registry
