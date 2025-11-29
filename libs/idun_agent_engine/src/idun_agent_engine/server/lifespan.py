"""Server lifespan management utilities.

Initializes the agent at startup and cleans up resources on shutdown.
"""

import inspect
from collections.abc import Sequence
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ..core.config_builder import ConfigBuilder
from ..mcp import MCPClientRegistry

from idun_agent_schema.engine.guardrails import Guardrails, Guardrail

from ..guardrails.base import BaseGuardrail


def _parse_guardrails(guardrails_obj: Guardrails) -> Sequence[BaseGuardrail]:
    """Adds the position of the guardrails (input/output) and returns the lift of updated guardrails."""

    from ..guardrails.guardrails_hub.guardrails_hub import GuardrailsHubGuard as GHGuard

    if not guardrails_obj.enabled:
        return []

    return [GHGuard(guard, position="input") for guard in guardrails_obj.input] + [
        GHGuard(guard, position="output") for guard in guardrails_obj.output
    ]


async def cleanup_agent(app: FastAPI):
    """Clean up agent resources."""
    agent = getattr(app.state, "agent", None)
    if agent is not None:
        close_fn = getattr(agent, "close", None)
        if callable(close_fn):
            result = close_fn()
            if inspect.isawaitable(result):
                await result


async def configure_app(app: FastAPI, engine_config):
    """Initialize the agent, MCP registry, guardrails, and app state with the given engine config."""
    guardrails_obj = engine_config.guardrails
    guardrails = _parse_guardrails(guardrails_obj) if guardrails_obj else []

    print("guardrails: ", guardrails)

    # Use ConfigBuilder's centralized agent initialization
    try:
        agent_instance = await ConfigBuilder.initialize_agent_from_config(engine_config)
    except Exception as e:
        raise ValueError(
            f"Error retrieving agent instance from ConfigBuilder: {e}"
        ) from e

    app.state.agent = agent_instance
    app.state.config = engine_config
    app.state.mcp_registry = MCPClientRegistry(engine_config.mcp_servers)
    app.state.engine_config = engine_config

    app.state.guardrails = guardrails  # TODO: to reactivate
    agent_name = getattr(agent_instance, "name", "Unknown")
    print(f"✅ Agent '{agent_name}' initialized and ready to serve!")

    # Setup AGUI routes if the agent is a LangGraph agent
    from ..agent.langgraph.langgraph import LanggraphAgent
    from ..agent.adk.adk import AdkAgent
    # from ..server.routers.agui import setup_agui_router

    if isinstance(agent_instance, (LanggraphAgent, AdkAgent)):
        try:
            # compiled_graph = getattr(agent_instance, "agent_instance")
            # app.state.copilotkit_agent = setup_agui_router(app, agent_instance) # TODO: agent_instance is a compiled graph (duplicate agent_instance name not clear)
            app.state.copilotkit_agent = agent_instance.copilotkit_agent_instance
        except Exception as e:
            print(f"⚠️ Warning: Failed to setup AGUI routes: {e}")
            # Continue even if AGUI setup fails

    if app.state.mcp_registry.enabled:
        servers = ", ".join(app.state.mcp_registry.available_servers())
        print(f"🔌 MCP servers ready: {servers}")



@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context to initialize and teardown the agent."""

    # Load config and initialize agent on startup
    print("Server starting up...")
    if not app.state.engine_config:
        raise ValueError("Error: No Engine configuration found.")

    await configure_app(app, app.state.engine_config)

    yield

    # Clean up on shutdown
    print("🔄 Idun Agent Engine shutting down...")
    await cleanup_agent(app)
    print("✅ Agent resources cleaned up successfully.")
