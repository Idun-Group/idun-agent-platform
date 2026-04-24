"""Application Factory for Idun Agent Engine.

This module provides the main entry point for users to create a FastAPI
application with their agent integrated. It handles all the complexity of
setting up routes, dependencies, and lifecycle management behind the scenes.
"""

import importlib.resources
import logging
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

_BUNDLED_UI_RESOURCE = "_web"
_INDEX_FILE = "index.html"


def _find_bundled_ui() -> Path | None:
    """Return the path to the bundled chat UI if present in this install.

    CI pre-builds the Next.js bundle and force-includes it at
    ``idun_agent_engine/_web`` inside the wheel. Editable source installs
    skip this step, so the directory is absent. Any failure to resolve the
    resource is treated as "no bundle" and we fall back to the JSON landing.
    """
    try:
        resource = importlib.resources.files("idun_agent_engine") / _BUNDLED_UI_RESOURCE
    except (ModuleNotFoundError, FileNotFoundError, TypeError) as exc:
        logger.debug("Bundled UI resource not found: %s", exc)
        return None

    try:
        path = Path(str(resource))
    except (TypeError, ValueError) as exc:
        logger.debug("Bundled UI resource not a filesystem path: %s", exc)
        return None

    if not path.is_dir():
        logger.debug("Bundled UI path is not a directory: %s", path)
        return None
    if not (path / _INDEX_FILE).is_file():
        logger.debug("Bundled UI path missing %s: %s", _INDEX_FILE, path)
        return None

    return path


def _resolve_ui_dir(ui_dir_override: str | None) -> Path | None:
    """Pick the UI directory to serve: explicit override wins, else bundled, else None."""
    if ui_dir_override is not None:
        raw = ui_dir_override.strip()
        if not raw:
            raise ValueError("UI dir override is empty")
        override = Path(raw).expanduser().resolve()
        if not override.exists():
            raise ValueError(f"UI dir does not exist: {override}")
        if not override.is_dir():
            raise ValueError(f"UI dir is not a directory: {override}")
        if not (override / _INDEX_FILE).is_file():
            hint = ""
            if (override / "package.json").is_file() and (override / "out").is_dir():
                hint = (
                    f" (hint: {override} looks like a Next.js source dir; "
                    f"try {override / 'out'} after running `pnpm build`)"
                )
            raise ValueError(
                f"UI dir missing {_INDEX_FILE}: {override}{hint}"
            )
        logger.info("Using UI override at %s", override)
        return override

    bundled = _find_bundled_ui()
    if bundled is None:
        logger.info("No UI bundle found; / will return the JSON landing")
    else:
        logger.info("Using bundled UI at %s", bundled)
    return bundled


def _register_root(app: FastAPI, ui_dir: Path | None) -> None:
    """Own the / route. Mount the UI when resolved, else serve JSON landing.

    Must run after all explicit routers are attached so /docs, /health,
    /agent/*, /integrations/* and friends win over the mount's catch-all.
    """
    if ui_dir is not None:
        app.mount(
            "/",
            StaticFiles(directory=str(ui_dir), html=True),
            name="ui",
        )
        logger.info("Chat UI mounted at / (source: %s)", ui_dir)
        return

    @app.get("/", include_in_schema=False)
    def _root_fallback() -> dict[str, Any]:
        return {
            "message": "Welcome to your Idun Agent Engine server!",
            "docs": "/docs",
            "health": "/health",
            "agent_endpoints": {
                "run": "/agent/run",
                "capabilities": "/agent/capabilities",
            },
        }

    logger.info("No chat UI configured; / returns the JSON landing")


def create_app(
    config_path: str | None = None,
    config_dict: dict[str, Any] | None = None,
    engine_config: EngineConfig | None = None,
    ui_dir_override: str | None = None,
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
        ui_dir_override: Optional path to a prebuilt static UI directory (containing
            index.html). Overrides the bundled default UI. Resolved against the
            current working directory. Raises ValueError at startup if the path is
            missing or lacks an index.html.

    Returns:
        FastAPI: A configured FastAPI application ready to serve your agent.
    """
    ui_dir = _resolve_ui_dir(ui_dir_override)
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
                case _:
                    pass

    # Root owner registered last so /docs, /health, /agent/*, /integrations/*
    # win over the static mount's catch-all.
    _register_root(app, ui_dir)

    return app
