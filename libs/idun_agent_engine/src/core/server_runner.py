"""
Server Runner for Idun Agent Engine

This module provides convenient functions to run FastAPI applications created with
the Idun Agent Engine. It handles common deployment scenarios and provides sensible defaults.
"""

from typing import Optional
import uvicorn
from fastapi import FastAPI


def run_server(
    app: FastAPI,
    host: str = "0.0.0.0",
    port: int = 8000,
    reload: bool = False,
    log_level: str = "info",
    workers: Optional[int] = None
) -> None:
    """
    Run a FastAPI application created with Idun Agent Engine.
    
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
    
    print(f"🌐 Starting Idun Agent Engine server on http://{host}:{port}")
    print(f"📚 API documentation available at http://{host}:{port}/docs")
    
    if reload and workers:
        print("⚠️  Warning: reload=True is incompatible with workers > 1. Disabling reload.")
        reload = False
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=reload,
        log_level=log_level,
        workers=workers
    )


def run_server_from_config(config_path: str = "config.yaml", **kwargs) -> None:
    """
    Create and run a server directly from a configuration file.
    
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
    
    # Load configuration using ConfigBuilder
    engine_config = ConfigBuilder.load_from_file(config_path)
    
    # Create app with the loaded config
    app = create_app(engine_config=engine_config)
    
    # Extract port from config if not overridden
    if 'port' not in kwargs:
        kwargs['port'] = engine_config.server.api.port
    
    # Show configuration info
    print(f"🔧 Loaded configuration from {config_path}")
    print(f"🤖 Agent: {engine_config.agent.config.get('name', 'Unknown')} ({engine_config.agent.type})")
    
    run_server(app, **kwargs)


def run_server_from_builder(config_builder, **kwargs) -> None:
    """
    Create and run a server directly from a ConfigBuilder instance.
    
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
    
    # Build the configuration if it's a ConfigBuilder instance
    if hasattr(config_builder, 'build'):
        engine_config = config_builder.build()
    else:
        # Assume it's already an EngineConfig
        engine_config = config_builder
    
    # Create app with the config
    app = create_app(engine_config=engine_config)
    
    # Extract port from config if not overridden
    if 'port' not in kwargs:
        kwargs['port'] = engine_config.server.api.port
    
    # Show configuration info
    print(f"🔧 Using programmatic configuration")
    print(f"🤖 Agent: {engine_config.agent.config.get('name', 'Unknown')} ({engine_config.agent.type})")
    
    run_server(app, **kwargs) 