"""Server lifespan management utilities.

Initializes the agent at startup and cleans up resources on shutdown.
"""
import inspect
import logging
from collections.abc import Awaitable, Callable, Sequence
from contextlib import asynccontextmanager

from fastapi import FastAPI
from idun_agent_schema.engine.guardrails import Guardrails

from idun_agent_engine.mcp.registry import MCPClientRegistry, set_active_registry

from ..core.config_builder import ConfigBuilder
from ..guardrails.base import BaseGuardrail
from ..telemetry import get_telemetry, sanitize_telemetry_config

logger = logging.getLogger(__name__)


PostConfigureCallback = Callable[[FastAPI], Awaitable[None]]


def _parse_guardrails(guardrails_obj: Guardrails) -> Sequence[BaseGuardrail]:
    """Build guard instances; one failure does not drop the rest."""
    from ..guardrails.guardrails_hub.guardrails_hub import GuardrailsHubGuard as GHGuard

    if not guardrails_obj:
        return []

    guards: list[BaseGuardrail] = []
    for position, configs in (
        ("input", guardrails_obj.input),
        ("output", guardrails_obj.output),
    ):
        for guard in configs:
            config_id = getattr(guard, "config_id", "<unknown>")
            try:
                guards.append(GHGuard(guard, position=position))
                logger.info("Guardrail '%s' (%s) initialized", config_id, position)
            except (Exception, SystemExit):
                logger.exception(
                    "Guardrail '%s' (%s) init failed; skipping",
                    config_id,
                    position,
                )
    return guards


async def cleanup_agent(app: FastAPI):
    """Clean up agent resources."""
    set_active_registry(None)
    agent = getattr(app.state, "agent", None)
    if agent is not None:
        close_fn = getattr(agent, "close", None)
        if callable(close_fn):
            result = close_fn()
            if inspect.isawaitable(result):
                await result


async def configure_app(app: FastAPI, engine_config):
    """Initialize the agent, MCP registry, guardrails, and app state with the given engine config.

    After all setup is done — including reload via ``POST /reload`` — every
    callback registered in ``app.state.post_configure_callbacks`` is awaited.
    Embedders (e.g. ``idun_agent_standalone``) use this hook to re-attach
    cross-cutting concerns (run-event observers, telemetry instrumentation)
    that would otherwise be lost when ``configure_app`` rebuilds the agent
    from scratch.
    """
    # Preserve any callbacks the embedder registered before the engine
    # lifespan ran. Reload only mutates ``app.state.agent`` etc., so the
    # callback list naturally survives across reloads.
    if not hasattr(app.state, "post_configure_callbacks"):
        app.state.post_configure_callbacks = []

    guardrails_obj = engine_config.guardrails
    try:
        guardrails = _parse_guardrails(guardrails_obj) if guardrails_obj else []
        logger.debug(f"Guardrails: {guardrails}")
    except Exception as e:
        logger.exception(f"Failed to parse guardrails: {e}, continuing without them")
        guardrails = []

    # Use ConfigBuilder's centralized agent initialization, passing the registry
    try:
        mcp_registry = MCPClientRegistry(engine_config.mcp_servers or [])
    except Exception as e:
        logger.exception(f"⚠️ Failed to initialize MCP registry: {e}, continuing without MCP servers")
        mcp_registry = MCPClientRegistry()
    set_active_registry(mcp_registry)
    app.state.mcp_registry = mcp_registry
    # Surface per-server failures so embedders (e.g. the standalone
    # admin UI) can render a "failed" badge instead of guessing from
    # logs. Replaced on every reload so stale failures don't linger.
    app.state.failed_mcp_servers = mcp_registry.failed
    try:
        agent_instance = await ConfigBuilder.initialize_agent_from_config(engine_config, mcp_registry)
    except Exception as e:
        raise ValueError(
            f"Error retrieving agent instance from ConfigBuilder: {e}"
        ) from e

    app.state.agent = agent_instance
    app.state.config = engine_config
    app.state.engine_config = engine_config

    app.state.guardrails = guardrails
    mcp_servers = engine_config.mcp_servers
    if mcp_servers:
        try:
            app.state.mcp_servers = mcp_servers
            for s in mcp_servers:
                logger.info(
                    f"🔧 MCP Server {s.name}: [{s.transport.upper()}] {s.url or s.command}"
                )
        except Exception as e:
            logger.exception(f"Failed to assign mcp servers to agent: {e}, continuing without them")
            mcp_servers = []

    # SSO / OIDC setup
    sso_config = engine_config.sso
    if sso_config and sso_config.enabled:
        from ..server.auth import OIDCValidator

        try:
            app.state.sso_validator = OIDCValidator(sso_config)
            logger.info(f"🔒 SSO enabled — issuer: {sso_config.issuer}")
        except Exception as e:
            logger.exception(f"Failed to add SSO: {e}, continuing without them")
            app.state.sso_validator = None
    else:
        app.state.sso_validator = None

    agent_name = getattr(agent_instance, "name", "Unknown")
    logger.info(f"✅ Agent '{agent_name}' initialized and ready to serve!")

    # Setup AGUI routes if the agent is a LangGraph agent
    from ..agent.adk.adk import AdkAgent
    from ..agent.langgraph.langgraph import LanggraphAgent

    if isinstance(agent_instance, (LanggraphAgent, AdkAgent)):
        try:
            app.state.copilotkit_agent = agent_instance.copilotkit_agent_instance
        except Exception as e:
            logger.warning(f"⚠️ Failed to setup AGUI routes: {e}")
            # Continue even if AGUI setup fails

    # Cache agent capabilities for discovery endpoint
    if hasattr(agent_instance, "discover_capabilities"):
        try:
            app.state.capabilities = agent_instance.discover_capabilities()
            logger.info(
                f"📋 Agent capabilities discovered: "
                f"input={app.state.capabilities.input.mode}, "
                f"output={app.state.capabilities.output.mode}"
            )
        except Exception as e:
            logger.warning(f"⚠️ Failed to discover agent capabilities: {e}")
            app.state.capabilities = None

    # Setup integrations (WhatsApp, etc.)
    if engine_config.integrations:
        from ..integrations import setup_integrations

        app.state.integrations = await setup_integrations(
            app, engine_config.integrations, agent_instance
        )
    else:
        app.state.integrations = []

    # Run embedder-supplied post-configure callbacks. We deliberately log
    # and continue on failure so a misbehaving callback can't take the
    # whole reload down with it (the agent itself is already live by now).
    callbacks: list[PostConfigureCallback] = list(
        getattr(app.state, "post_configure_callbacks", [])
    )
    for cb in callbacks:
        try:
            await cb(app)
        except Exception:
            logger.exception(
                "post_configure_callback %r raised; continuing", cb
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context to initialize and teardown the agent."""
    # Apply monkey patches for upstream ag-ui bugs (safe to remove once fixed upstream)
    from .patches import apply_all as _apply_ag_ui_patches

    _apply_ag_ui_patches()

    # Load config and initialize agent on startup
    logger.info("🚀 Server starting up...")
    if app.state.engine_config is not None:
        await configure_app(app, app.state.engine_config)
    else:
        # Unconfigured boot: agent state stays empty until an embedder
        # calls ``configure_app`` explicitly (typically via the standalone
        # reload pipeline once a wizard materializes the agent). Set the
        # markers downstream readers expect so ``getattr(...)`` short
        # -circuits cleanly.
        app.state.agent = None
        if not hasattr(app.state, "post_configure_callbacks"):
            app.state.post_configure_callbacks = []
        logger.info(
            "⏸️  Engine started unconfigured — /agent/* will 503 until configure_app runs"
        )

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
        logger.warning(f"⚠️ Failed to start telemetry: {e}")
        app.state.telemetry = None

    yield

    # Clean up on shutdown
    logger.info("🔄 Idun Agent Engine shutting down...")

    # Shutdown integrations
    for integration in getattr(app.state, "integrations", []):
        try:
            await integration.shutdown()
        except Exception as e:
            logger.warning(f"⚠️ Failed to shutdown integration: {e}")

    telemetry = getattr(app.state, "telemetry", None)
    if telemetry is not None:
        telemetry.capture("engine stopped")
    await cleanup_agent(app)
    if telemetry is not None:
        telemetry.shutdown()
    logger.info("✅ Agent resources cleaned up successfully.")
