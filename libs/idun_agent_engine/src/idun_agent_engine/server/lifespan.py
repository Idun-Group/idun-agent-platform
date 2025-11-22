"""Server lifespan management utilities.

Initializes the agent at startup and cleans up resources on shutdown.
"""

import inspect
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ..core.config_builder import ConfigBuilder
from ..mcp import MCPClientRegistry

from idun_agent_schema.engine.guardrails import Guardrails, Guardrail


def _parse_guardrails(guardrails_obj: Guardrails) -> list[Guardrail]:
    """Adds the position of the guardrails (input/output) and returns the lift of updated guardrails."""

    from ..guardrails.guardrails_hub.guardrails_hub import GuardrailsHubGuard as GHGuard

    guardrails = []
    input_guardrails = guardrails_obj.input
    output_guardrails = guardrails_obj.output

    for guard in input_guardrails:
        guardrails.append(GHGuard(guard, position="input"))

    for guard in output_guardrails:
        guardrails.append(GHGuard(guard, position="output"))

    return guardrails


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context to initialize and teardown the agent."""

    # Load config and initialize agent on startup
    print("Server starting up...")
    if not app.state.engine_config:
        raise ValueError("Error: No Engine configuration found.")

    engine_config = app.state.engine_config
    guardrails_obj = app.state.engine_config.guardrails
    guardrails = _parse_guardrails(guardrails_obj)

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

    app.state.guardrails = guardrails
    # Store both in app state
    agent_name = getattr(agent_instance, "name", "Unknown")
    print(f"✅ Agent '{agent_name}' initialized and ready to serve!")

    if app.state.mcp_registry.enabled:
        servers = ", ".join(app.state.mcp_registry.available_servers())
        print(f"🔌 MCP servers ready: {servers}")

    yield

    # Clean up on shutdown
    print("🔄 Idun Agent Engine shutting down...")
    agent = getattr(app.state, "agent", None)
    if agent is not None:
        close_fn = getattr(agent, "close", None)
        if callable(close_fn):
            result = close_fn()
            if inspect.isawaitable(result):
                await result
    print("✅ Agent resources cleaned up successfully.")
