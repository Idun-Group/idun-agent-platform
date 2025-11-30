"""Server lifespan management utilities.

Initializes the agent at startup and cleans up resources on shutdown.
"""

import inspect
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ..core.config_builder import ConfigBuilder
from ..core.logging_config import get_logger, log_operation
from ..mcp import MCPClientRegistry

from idun_agent_schema.engine.guardrails import Guardrails, Guardrail

logger = get_logger("server_lifespan")


def _parse_guardrails(guardrails_obj: Guardrails) -> list[Guardrail]:
    """Adds the position of the guardrails (input/output) and returns the lift of updated guardrails."""

    from ..guardrails.guardrails_hub.guardrails_hub import GuardrailsHubGuard as GHGuard

    if not guardrails_obj.enabled:
        return []

    return [GHGuard(guard, position="input") for guard in guardrails_obj.input] + [
        GHGuard(guard, position="output") for guard in guardrails_obj.output
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context to initialize and teardown the agent."""

    log_operation(logger, "DEBUG", "server_startup_start", "Server starting up")

    if not app.state.engine_config:
        error_msg = "No Engine configuration found"
        log_operation(
            logger, "ERROR", "config_missing", error_msg, error_type="ConfigNotFound"
        )
        raise ValueError(f"Error: {error_msg}")

    engine_config = app.state.engine_config

    log_operation(
        logger,
        "DEBUG",
        "config_loaded",
        "Engine configuration loaded",
        agent_config=engine_config.agent.model_dump()
        if hasattr(engine_config.agent, "model_dump")
        else engine_config.agent,
        server_config={"api": engine_config.server.api.model_dump()}
        if hasattr(engine_config.server.api, "model_dump")
        else engine_config.server,
    )

    guardrails_obj = app.state.engine_config.guardrails

    try:
        agent_instance = await ConfigBuilder.initialize_agent_from_config(engine_config)

        agent_id = getattr(agent_instance, "id", None)
        agent_type = getattr(agent_instance, "agent_type", None)
        agent_name = getattr(agent_instance, "name", "Unknown")
        agent_config = None
        if hasattr(agent_instance, "configuration"):
            try:
                config = agent_instance.configuration
                agent_config = (
                    config.model_dump() if hasattr(config, "model_dump") else config
                )
            except:
                agent_config = None

        log_operation(
            logger,
            "INFO",
            "agent_initialized",
            f"Agent '{agent_name}' ready to serve",
            agent_id=agent_id,
            agent_type=agent_type,
            agent_name=agent_name,
        )

    except Exception as e:
        log_operation(
            logger,
            "ERROR",
            "agent_initialization_failed",
            "Agent initialization failed",
            error_type=type(e).__name__,
            error_details=str(e),
        )
        raise ValueError(
            f"Error retrieving agent instance from ConfigBuilder: {e}"
        ) from e

    app.state.agent = agent_instance
    app.state.config = engine_config
    app.state.mcp_registry = MCPClientRegistry(engine_config.mcp_servers)

    # Setup AGUI routes if the agent is a LangGraph agent
    from ..agent.langgraph.langgraph import LanggraphAgent
    from ..agent.adk.adk import AdkAgent

    if isinstance(agent_instance, (LanggraphAgent, AdkAgent)):
        try:
            app.state.copilotkit_agent = agent_instance.copilotkit_agent_instance
            log_operation(
                logger,
                "DEBUG",
                "copilotkit_setup",
                "CopilotKit agent setup completed",
                agent_id=agent_id,
                agent_type=agent_type,
                agent_name=agent_name,
            )
        except Exception as e:
            log_operation(
                logger,
                "WARNING",
                "copilotkit_setup_failed",
                "Failed to setup CopilotKit routes",
                agent_id=agent_id,
                agent_type=agent_type,
                agent_name=agent_name,
                error_type=type(e).__name__,
                error_details=str(e),
            )

    if app.state.mcp_registry.enabled:
        servers = ", ".join(app.state.mcp_registry.available_servers())
        log_operation(
            logger,
            "DEBUG",
            "mcp_servers_ready",
            "MCP servers ready",
            server_list=servers,
        )

    log_operation(
        logger,
        "INFO",
        "server_ready",
        f"Server ready - {agent_name} listening on port {engine_config.server.api.port}",
        agent_id=agent_id,
        agent_type=agent_type,
        agent_name=agent_name,
    )

    yield

    log_operation(
        logger,
        "INFO",
        "server_shutdown_start",
        "Idun Agent Engine shutting down",
        agent_id=agent_id,
        agent_type=agent_type,
        agent_name=agent_name,
    )

    agent = getattr(app.state, "agent", None)
    if agent is not None:
        close_fn = getattr(agent, "close", None)
        if callable(close_fn):
            result = close_fn()
            if inspect.isawaitable(result):
                await result

    log_operation(
        logger,
        "INFO",
        "server_shutdown_completed",
        "Agent resources cleaned up successfully",
        agent_id=agent_id,
        agent_type=agent_type,
        agent_name=agent_name,
    )
