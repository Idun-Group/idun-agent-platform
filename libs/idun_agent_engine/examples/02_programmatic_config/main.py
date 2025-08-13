"""
Example 2: Programmatic Configuration

This example demonstrates how to configure your agent using the ConfigBuilder API
instead of YAML files. This approach is great for dynamic configuration and
when you want type safety and IDE support.
"""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from src import ConfigBuilder, create_app, run_server, run_server_from_builder


def basic_config_example():
    """Example 1: Basic hardcoded configuration using Pydantic models."""
    print("🔧 Creating basic programmatic configuration...")

    config = (
        ConfigBuilder()
        .with_api_port(8000)
        .with_langgraph_agent(
            name="Programmatic Example Agent",
            graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
            sqlite_checkpointer="programmatic_example.db",
        )
        .build()
    )

    print(f"✅ Created validated config: {config.agent.config['name']}")
    return config


def environment_based_config():
    """Example 2: Environment-driven configuration with validation."""
    print("🔧 Creating environment-based configuration...")

    # Get configuration from environment variables
    port = int(os.getenv("PORT", 8001))
    environment = os.getenv("ENVIRONMENT", "dev")
    telemetry_provider = os.getenv("TELEMETRY_PROVIDER", "langfuse")

    config = (
        ConfigBuilder()
        .with_api_port(port)
        .with_langgraph_agent(
            name=f"Smart Agent ({environment})",
            graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
            sqlite_checkpointer=f"{environment}_smart_agent.db",
        )
        .build()
    )

    print(
        f"📊 Configuration validated: Port={config.server.api.port}, Environment={environment}"
    )
    print(f"🤖 Agent: {config.agent.config['name']}")
    return config


def load_and_modify_config():
    """Example 3: Load existing config file and modify it programmatically."""
    print("🔧 Loading and modifying existing configuration...")

    # Load configuration from the basic example's config file
    basic_config_path = str(
        Path(__file__).parent.parent / "01_basic_config_file" / "config.yaml"
    )

    try:
        # Load existing config using ConfigBuilder
        builder = ConfigBuilder.from_file(basic_config_path)

        # Modify the configuration programmatically
        modified_config = (
            builder.with_api_port(8002)
            .with_langgraph_agent(
                name="Modified Configuration Agent",
                graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
                sqlite_checkpointer="modified_agent.db",
            )
            .build()
        )

        print(f"✅ Loaded and modified config from {basic_config_path}")
        print(f"🤖 Modified agent name: {modified_config.agent.config['name']}")
        print(f"🌐 Modified port: {modified_config.server.api.port}")

        return modified_config

    except FileNotFoundError:
        print(
            f"⚠️  Config file not found at {basic_config_path}, using basic config instead"
        )
        return basic_config_example()


def conditional_config():
    """Example 4: Conditional configuration with type safety."""
    print("🔧 Creating conditional configuration...")

    # Determine configuration based on some logic
    is_production = os.getenv("ENVIRONMENT") == "production"

    if is_production:
        # Production configuration
        config = (
            ConfigBuilder()
            .with_api_port(80)
            .with_langgraph_agent(
                name="Production Smart Agent",
                graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
                sqlite_checkpointer="/data/production_agent.db",
            )
            .build()
        )
    else:
        # Development configuration
        config = (
            ConfigBuilder()
            .with_api_port(8003)
            .with_langgraph_agent(
                name="Development Smart Agent",
                graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
                sqlite_checkpointer="dev_smart_agent.db",
            )
            .build()
        )

    mode = "production" if is_production else "development"
    print(f"📊 Running in {mode} mode with validated config")
    print(f"🤖 Agent: {config.agent.config['name']}")
    print(f"🌐 Port: {config.server.api.port}")
    return config


def save_and_load_config():
    """Example 5: Build, save, and reload configuration demonstrating round-trip."""
    print("💾 Building, saving, and reloading configuration...")

    # Build a configuration
    original_config = (
        ConfigBuilder()
        .with_api_port(8004)
        .with_langgraph_agent(
            name="Save and Load Agent",
            graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
            sqlite_checkpointer="save_load_agent.db",
        )
        .build()
    )

    print(f"✅ Original configuration created: {original_config.agent.config['name']}")

    # Save to file using ConfigBuilder
    config_file = Path(__file__).parent / "generated_config.yaml"
    config_builder = ConfigBuilder.from_engine_config(original_config)
    config_builder.save_to_file(str(config_file))
    print(f"💾 Configuration saved to {config_file}")

    # Load it back using ConfigBuilder.load_from_file
    reloaded_config = ConfigBuilder.load_from_file(str(config_file))
    print("📂 Configuration reloaded from file")

    # Verify they're the same
    if original_config.model_dump() == reloaded_config.model_dump():
        print("✅ Round-trip successful - configurations match!")
    else:
        print("❌ Round-trip failed - configurations differ!")

    return reloaded_config


def builder_direct_run():
    """Example 6: Use ConfigBuilder to run server directly without intermediate steps."""
    print("🚀 Running server directly from ConfigBuilder...")

    # Create ConfigBuilder but don't build it yet
    builder = (
        ConfigBuilder()
        .with_api_port(8005)
        .with_langgraph_agent(
            name="Direct Run Agent",
            graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
            sqlite_checkpointer="direct_run_agent.db",
        )
    )

    print("✅ ConfigBuilder created, starting server directly...")

    # Run server directly from builder - this will build the config internally
    run_server_from_builder(builder, reload=True)
    # This function doesn't return as it starts the server


async def demonstrate_agent_initialization():
    """Example 7: Demonstrate ConfigBuilder's agent initialization capabilities."""
    print("🤖 Demonstrating agent initialization with ConfigBuilder...")

    # Method 1: Build and initialize in one step
    print("\n🔧 Method 1: Build and initialize agent in one step")
    builder = ConfigBuilder().with_langgraph_agent(
        name="Initialization Demo Agent",
        graph_definition=str(Path(__file__).parent / "smart_agent.py:app"),
    )

    agent = await builder.build_and_initialize_agent()
    print(f"✅ Agent initialized: {agent.name} (ID: {agent.id})")

    # Method 2: Load config and initialize agent from file
    print("\n🔧 Method 2: Load and initialize from file")
    basic_config_path = str(
        Path(__file__).parent.parent / "01_basic_config_file" / "config.yaml"
    )

    try:
        engine_config, agent2 = await ConfigBuilder.load_and_initialize_agent(
            basic_config_path
        )
        print(f"✅ Agent loaded from file: {agent2.name} (ID: {agent2.id})")
        print(
            f"📊 Config details: Port={engine_config.server.api.port}, Type={engine_config.agent.type}"
        )
    except FileNotFoundError:
        print("⚠️  Config file not found, skipping file-based initialization")

    # Method 3: Initialize from existing config
    print("\n🔧 Method 3: Initialize from existing EngineConfig")
    config = builder.build()
    agent3 = await ConfigBuilder.initialize_agent_from_config(config)
    print(f"✅ Agent initialized from config: {agent3.name} (ID: {agent3.id})")

    # Clean up
    if hasattr(agent, "close"):
        await agent.close()
    if "agent2" in locals() and hasattr(agent2, "close"):
        await agent2.close()
    if hasattr(agent3, "close"):
        await agent3.close()

    print("✅ Agent initialization demonstration complete!")


def main():
    """Main function that demonstrates different configuration approaches."""

    # Choose which example to run based on command line argument
    example = sys.argv[1] if len(sys.argv) > 1 else "basic"

    if example == "basic":
        config = basic_config_example()
    elif example == "environment":
        config = environment_based_config()
    elif example == "load_modify":
        config = load_and_modify_config()
    elif example == "conditional":
        config = conditional_config()
    elif example == "save_load":
        config = save_and_load_config()
    elif example == "direct_run":
        builder_direct_run()
        return  # This doesn't return as it starts the server
    elif example == "agent_init":
        import asyncio

        asyncio.run(demonstrate_agent_initialization())
        return
    else:
        print(
            "❌ Unknown example. Use: basic, environment, load_modify, conditional, save_load, direct_run, or agent_init"
        )
        return

    # Create and run the app using the validated config (recommended way)
    print("🚀 Starting server with validated Pydantic configuration...")
    app = create_app(engine_config=config)
    run_server(app, reload=True)


if __name__ == "__main__":
    print(
        """
🎯 Programmatic Configuration Examples (with Enhanced ConfigBuilder)

Available examples:
  python main.py basic        - Basic hardcoded configuration
  python main.py environment  - Environment-based configuration
  python main.py load_modify  - Load existing config and modify it
  python main.py conditional  - Conditional configuration logic
  python main.py save_load    - Save and reload configuration
  python main.py direct_run   - Run server directly from ConfigBuilder
  python main.py agent_init   - Demonstrate agent initialization methods

💡 Try setting environment variables:
  PORT=8080 ENVIRONMENT=staging python main.py environment

✨ New ConfigBuilder features:
  - ConfigBuilder.load_from_file() - Load and validate YAML configs
  - ConfigBuilder.from_file() - Create builder from YAML file
  - ConfigBuilder.build_and_initialize_agent() - One-step agent creation
  - ConfigBuilder.initialize_agent_from_config() - Initialize from config
  - run_server_from_builder() - Run server directly from builder
  - Full type safety with Pydantic models
  - Centralized agent management
  - Renamed: EngineConfig (was AppConfig), ServerConfig (was EngineConfig)
"""
    )
    main()
