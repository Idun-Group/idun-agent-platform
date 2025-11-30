"""Server Runner for Idun Agent Engine.

This module provides convenient functions to run FastAPI applications created with
the Idun Agent Engine. It handles common deployment scenarios and provides sensible defaults.
"""

import uvicorn
from fastapi import FastAPI
from .logging_config import get_logger, log_operation

logger = get_logger("server_runner")


def run_server(
    app: FastAPI,
    host: str = "0.0.0.0",
    port: int = 8000,
    reload: bool = False,
    log_level: str = "info",
    workers: int | None = None,
) -> None:
    """Run a FastAPI application created with Idun Agent Engine.

    This is a convenience function that wraps uvicorn.run() with sensible defaults
    for serving agent applications. It automatically handles common deployment scenarios.

    Args:
        app: The FastAPI application created with create_app()
        host: Host to bind the server to. Defaults to "0.0.0.0" (all interfaces)
        port: Port to bind the server to. Defaults to 8000
        reload: Enable auto-reload for development. Defaults to False
        log_level: Logging level. Defaults to "info"
        workers: Number of worker processes. If None, uses single process

    Example:
        from idun_agent_engine import create_app, run_server

        # Create your app
        app = create_app("config.yaml")

        # Run in development mode
        run_server(app, reload=True)

        # Run in production mode
        run_server(app, workers=4)
    """
    engine_config = getattr(app.state, 'engine_config', None)
    agent_config = None
    server_config = None

    if engine_config:
        agent_config = engine_config.agent.model_dump() if hasattr(engine_config.agent, 'model_dump') else engine_config.agent
        server_config = {"host": host, "port": port, "reload": reload, "log_level": log_level, "workers": workers}

    log_operation(
        logger, "INFO", "server_start", f"Starting Idun Agent Engine server on http://{host}:{port}",
        agent_config=agent_config,
        server_config=server_config
    )

    if reload and workers:
        log_operation(
            logger, "WARNING", "config_conflict", "reload=True is incompatible with workers > 1. Disabling reload",
            server_config={"reload": reload, "workers": workers}
        )
        reload = False

    try:
        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level=log_level,
        )
    except Exception as e:
        log_operation(
            logger, "ERROR", "server_failed", "Server failed to start",
            server_config=server_config,
            error_type=type(e).__name__,
            error_details=str(e)
        )
        raise


def run_server_from_config(config_path: str = "config.yaml", **kwargs) -> None:
    """Create and run a server directly from a configuration file.

    This is the most convenient way to start a server - it combines create_app()
    and run_server() in a single function call using ConfigBuilder.

    Args:
        config_path: Path to the configuration YAML file
        **kwargs: Additional arguments passed to run_server()

    Example:
        # Run server directly from config
        run_server_from_config("my_agent.yaml", port=8080, reload=True)
    """
    from .app_factory import create_app
    from .config_builder import ConfigBuilder

    log_operation(
        logger, "INFO", "server_from_config_start", f"Loading configuration and starting server from {config_path}"
    )

    try:
        # Load configuration using ConfigBuilder
        engine_config = ConfigBuilder.load_from_file(config_path)

        # Create app with the loaded config
        app = create_app(engine_config=engine_config)

        # Extract port from config if not overridden
        if "port" not in kwargs:
            kwargs["port"] = engine_config.server.api.port

        agent_name = (
            engine_config.agent.config.get("name")  # type: ignore[call-arg, index]
            if hasattr(engine_config.agent.config, "get")
            else getattr(engine_config.agent.config, "name", "Unknown")
        )

        log_operation(
            logger, "INFO", "config_loaded_for_server", f"Configuration loaded: Agent {agent_name} ({engine_config.agent.type})",
            agent_config=engine_config.agent.model_dump() if hasattr(engine_config.agent, 'model_dump') else engine_config.agent,
            server_config=kwargs
        )

        run_server(app, **kwargs)

    except Exception as e:
        log_operation(
            logger, "ERROR", "server_from_config_failed", f"Failed to start server from config {config_path}",
            error_type=type(e).__name__,
            error_details=str(e)
        )
        raise


def run_server_from_builder(config_builder, **kwargs) -> None:
    """Create and run a server directly from a ConfigBuilder instance.

    This allows for programmatic configuration with immediate server startup.

    Args:
        config_builder: ConfigBuilder instance (can be built or unbuilt)
        **kwargs: Additional arguments passed to run_server()

    Example:
        from idun_agent_engine import ConfigBuilder

        builder = (ConfigBuilder()
                  .with_langgraph_agent(name="My Agent", graph_definition="agent.py:graph")
                  .with_api_port(8080))

        run_server_from_builder(builder, reload=True)
    """
    from .app_factory import create_app

    log_operation(
        logger, "INFO", "server_from_builder_start", "Starting server from ConfigBuilder instance"
    )

    try:
        # Build the configuration if it's a ConfigBuilder instance
        if hasattr(config_builder, "build"):
            engine_config = config_builder.build()
        else:
            # Assume it's already an EngineConfig
            engine_config = config_builder

        # Create app with the config
        app = create_app(engine_config=engine_config)

        # Extract port from config if not overridden
        if "port" not in kwargs:
            kwargs["port"] = engine_config.server.api.port

        agent_name = (
            engine_config.agent.config.get("name")  # type: ignore[call-arg, index]
            if hasattr(engine_config.agent.config, "get")
            else getattr(engine_config.agent.config, "name", "Unknown")
        )

        log_operation(
            logger, "INFO", "builder_config_ready", f"ConfigBuilder ready: Agent {agent_name} ({engine_config.agent.type})",
            agent_config=engine_config.agent.model_dump() if hasattr(engine_config.agent, 'model_dump') else engine_config.agent,
            server_config=kwargs
        )

        run_server(app, **kwargs)

    except Exception as e:
        log_operation(
            logger, "ERROR", "server_from_builder_failed", "Failed to start server from ConfigBuilder",
            error_type=type(e).__name__,
            error_details=str(e)
        )
        raise
