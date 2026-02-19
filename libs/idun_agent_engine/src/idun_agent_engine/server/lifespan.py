"""Server lifespan management utilities.

Initializes the agent at startup and cleans up resources on shutdown.
"""

import inspect
from collections.abc import Sequence
from contextlib import asynccontextmanager

from fastapi import FastAPI
from idun_agent_schema.engine.guardrails import Guardrails

from ..core.config_builder import ConfigBuilder
from ..guardrails.base import BaseGuardrail
from ..telemetry import get_telemetry, sanitize_telemetry_config


def _parse_guardrails(guardrails_obj: Guardrails) -> Sequence[BaseGuardrail]:
    """Adds the position of the guardrails (input/output) and returns the lift of updated guardrails."""
    from ..guardrails.guardrails_hub.guardrails_hub import GuardrailsHubGuard as GHGuard

    if not guardrails_obj:
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

    # Use ConfigBuilder's centralized agent initialization, passing the registry
    try:
        agent_instance = await ConfigBuilder.initialize_agent_from_config(engine_config)
    except Exception as e:
        raise ValueError(
            f"Error retrieving agent instance from ConfigBuilder: {e}"
        ) from e

    app.state.agent = agent_instance
    app.state.config = engine_config
    app.state.engine_config = engine_config
    app.state.custom_input_model = getattr(agent_instance, "custom_input_model", None)

    app.state.guardrails = guardrails
    agent_name = getattr(agent_instance, "name", "Unknown")
    print(f"✅ Agent '{agent_name}' initialized and ready to serve!")

    # Setup AGUI routes if the agent is a LangGraph agent
    from ..agent.adk.adk import AdkAgent
    from ..agent.langgraph.langgraph import LanggraphAgent

    if isinstance(agent_instance, (LanggraphAgent, AdkAgent)):
        try:
            app.state.copilotkit_agent = agent_instance.copilotkit_agent_instance
        except Exception as e:
            print(f"⚠️ Warning: Failed to setup AGUI routes: {e}")
            # Continue even if AGUI setup fails


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context to initialize and teardown the agent."""
    # Load config and initialize agent on startup
    print("Server starting up...")
    if not app.state.engine_config:
        raise ValueError("Error: No Engine configuration found.")

    await configure_app(app, app.state.engine_config)

    try:
        telemetry = get_telemetry()
        app.state.telemetry = telemetry
        agent = getattr(app.state, "agent", None)
        telemetry.capture(
            "engine started",
            properties={
                "agent_type": type(agent).__name__ if agent is not None else None,
                "has_agent": agent is not None,
                "engine_config": sanitize_telemetry_config(app.state.engine_config),
            },
        )
    except Exception as e:
        print(f"⚠️ Warning: Failed to start telemetry: {e}")
        app.state.telemetry = None

    yield

    # Clean up on shutdown
    print("🔄 Idun Agent Engine shutting down...")
    telemetry = getattr(app.state, "telemetry", None)
    if telemetry is not None:
        telemetry.capture("engine stopped")
    await cleanup_agent(app)
    if telemetry is not None:
        telemetry.shutdown()
    print("✅ Agent resources cleaned up successfully.")
