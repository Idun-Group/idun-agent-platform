"""Application Factory for Idun Agent Engine.

This module provides the main entry point for users to create a FastAPI
application with their agent integrated. It handles all the complexity of
setting up routes, dependencies, and lifecycle management behind the scenes.
"""

import logging
import os
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import Response

from .._version import __version__
from ..server.lifespan import lifespan
from ..server.routers.agent import agent_router, register_invoke_route
from ..server.routers.base import base_router
from .config_builder import ConfigBuilder
from .engine_config import EngineConfig

logger = logging.getLogger(__name__)


def _maybe_mount_static_ui(app: FastAPI) -> bool:
    """Mount a static UI bundle at ``/`` when ``IDUN_UI_DIR`` is set.

    Returns ``True`` if a static mount was registered. The same JSON
    info payload is always available at ``/_engine/info``; the bare ``/``
    info handler is only registered (later) when this returns ``False``.
    """
    ui_dir = os.environ.get("IDUN_UI_DIR")
    if not ui_dir:
        return False
    ui_path = Path(ui_dir)
    if not ui_path.is_dir():
        logger.warning(
            "IDUN_UI_DIR=%s does not exist; skipping static UI mount", ui_dir
        )
        return False
    app.mount("/", StaticFiles(directory=str(ui_path), html=True), name="ui")
    logger.info("mounted static UI at / from %s", ui_dir)
    return True


def _register_default_root(app: FastAPI) -> None:
    """Serve the engine info payload at ``/`` when no static UI is mounted."""

    @app.get("/", include_in_schema=False)
    def _root():
        return {
            "message": "Welcome to your Idun Agent Engine server!",
            "docs": "/docs",
            "health": "/health",
            "agent_endpoints": {
                "invoke": "/agent/invoke",
                "stream": "/agent/stream",
            },
        }


def create_app(
    config_path: str | None = None,
    config_dict: dict[str, Any] | None = None,
    engine_config: EngineConfig | None = None,
    *,
    reload_auth: Callable[..., Any] | None = None,
) -> FastAPI:
    """Create a FastAPI application with an integrated agent.

    This is the main entry point for users of the Idun Agent Engine. It creates a
    fully configured FastAPI application that serves your agent with proper
    lifecycle management, routing, and error handling.

    Args:
        config_path: Optional path to a YAML configuration file. If not provided,
            looks for 'config.yaml' in the current directory.
        config_dict: Optional dictionary containing configuration. If provided,
            takes precedence over config_path. Useful for programmatic configuration.
        engine_config: Pre-validated EngineConfig instance (from ConfigBuilder.build()).
        Takes precedence over other options.
        reload_auth: Optional callable invoked as a FastAPI dependency on
            ``POST /reload``. When ``None`` (default), the route remains
            unprotected for backwards compatibility. The callable must raise
            :class:`fastapi.HTTPException` to deny a request; both sync and
            async callables are supported.

    Returns:
        FastAPI: A configured FastAPI application ready to serve your agent.
    """
    # Resolve configuration from various sources using ConfigBuilder's umbrella function
    validated_config = ConfigBuilder.resolve_config(
        config_path=config_path, config_dict=config_dict, engine_config=engine_config
    )

    # Resolve input model for /invoke endpoint
    try:
        input_model = ConfigBuilder.resolve_input_model(validated_config)
    except Exception as e:
        raise ValueError(f"Failed to resolve input model: {e}") from e

    # Create the FastAPI application
    app = FastAPI(
        lifespan=lifespan,
        title="Idun Agent Engine Server",
        description="A production-ready server for conversational AI agents",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # TODO: Add a proper CORS configuration feature. We currently keep wildcard
    # CORS behavior and layer Private Network Access support on top so the
    # hosted UI can reach localhost agents from the browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def allow_private_network_access(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)

        if request.headers.get("access-control-request-private-network") != "true":
            return response

        if "access-control-allow-origin" in response.headers:
            response.headers["Access-Control-Allow-Private-Network"] = "true"

        return response

    # Store configuration in app state for lifespan to use
    app.state.engine_config = validated_config

    # Store the optional /reload auth dependency on app state so the
    # `_reload_auth_dep` resolver in `routers.base` can pick it up. Always
    # set it (None by default) so `getattr(..., "reload_auth", None)` is
    # well-defined regardless of how the app is constructed.
    app.state.reload_auth = reload_auth

    # Include the routers
    app.include_router(agent_router, prefix="/agent", tags=["Agent"])
    app.include_router(base_router, tags=["Base"])

    # TODO: DEPRECATED — register_invoke_route uses ChatRequest only now.
    # Remove when /agent/invoke shim is fully removed.
    register_invoke_route(app, input_model)

    # Register integration routers based on config
    if validated_config.integrations:
        from idun_agent_schema.engine.integrations import IntegrationProvider

        from ..integrations.discord.handler import router as discord_router
        from ..integrations.teams.handler import router as teams_router
        from ..integrations.whatsapp.handler import router as whatsapp_router

        for integration in validated_config.integrations:
            match integration.provider:
                case IntegrationProvider.WHATSAPP if integration.enabled:
                    app.include_router(
                        whatsapp_router,
                        prefix="/integrations/whatsapp",
                        tags=["WhatsApp"],
                    )
                case IntegrationProvider.DISCORD if integration.enabled:
                    app.include_router(
                        discord_router,
                        prefix="/integrations/discord",
                        tags=["Discord"],
                    )
                case IntegrationProvider.TEAMS if integration.enabled:
                    app.include_router(
                        teams_router,
                        prefix="/integrations/teams",
                        tags=["Teams"],
                    )
                case _:
                    pass

    # Mount the static UI last so explicit routes (everything above) win.
    # When no UI dir is configured, fall back to the JSON info payload at /.
    if not _maybe_mount_static_ui(app):
        _register_default_root(app)

    return app
