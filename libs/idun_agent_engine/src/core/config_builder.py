"""
Configuration Builder for Idun Agent Engine

This module provides a fluent API for building configuration objects using Pydantic models.
This approach ensures type safety, validation, and consistency with the rest of the codebase.
"""

from pathlib import Path
from typing import Any

import yaml

from src.server.server_config import ServerAPIConfig

from ..agent.base import BaseAgent
from ..agent.langgraph.langgraph_model import (
    LangGraphAgentConfig,
    SqliteCheckpointConfig,
)
from .engine_config import AgentConfig, EngineConfig, ServerConfig


class ConfigBuilder:
    """
    A fluent builder for creating Idun Agent Engine configurations using Pydantic models.
    
    This class provides a convenient way to build strongly-typed configuration objects
    that are validated at creation time, ensuring consistency and catching errors early.
    It also handles agent initialization and management.
    
    Example:
        config = (ConfigBuilder()
                 .with_api_port(8080)
                 .with_langgraph_agent(
                     name="My Agent",
                     graph_definition="my_agent.py:graph",
                     sqlite_checkpointer="agent.db")
                 .build())
        
        app = create_app(config_dict=config.model_dump())
    """

    def __init__(self):
        """Initialize a new configuration builder with default values."""
        self._server_config = ServerConfig()
        self._agent_config: AgentConfig | None = None

    def with_api_port(self, port: int) -> "ConfigBuilder":
        """
        Set the API port for the server.
        
        Args:
            port: The port number to bind the server to
            
        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        # Create new API config with updated port
        api_config = ServerAPIConfig(port=port)
        self._server_config = ServerConfig(
            api=api_config,
        )
        return self

    # def with_telemetry(self, provider: str) -> "ConfigBuilder":
    #     """
    #     Set the telemetry provider.

    #     Args:
    #         provider: The telemetry provider name (e.g., "langfuse", "wandb")

    #     Returns:
    #         ConfigBuilder: This builder instance for method chaining
    #     """
    #     # Create new telemetry config with updated provider
    #     telemetry_config = ServerTelemetryConfig(provider=provider)
    #     self._server_config = ServerConfig(
    #         api=self._server_config.api,
    #         telemetry=telemetry_config
    #     )
    #     return self

    def with_server_config(
        self,
        api_port: int | None = None,
        telemetry_provider: str | None = None
    ) -> "ConfigBuilder":
        """
        Set server configuration options directly.
        
        Args:
            api_port: Optional API port
            telemetry_provider: Optional telemetry provider
            
        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        api_config = ServerAPIConfig(port=api_port) if api_port else self._server_config.api

        self._server_config = ServerConfig(api=api_config)
        return self

    def with_langgraph_agent(
        self,
        name: str,
        graph_definition: str,
        sqlite_checkpointer: str | None = None,
        **additional_config
    ) -> "ConfigBuilder":
        """
        Configure a LangGraph agent using the LangGraphAgentConfig model.
        
        Args:
            name: Human-readable name for the agent
            graph_definition: Path to the graph in format "module.py:variable_name"
            sqlite_checkpointer: Optional path to SQLite database for checkpointing
            **additional_config: Additional configuration parameters
            
        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        # Build the agent config dictionary
        agent_config_dict = {
            "name": name,
            "graph_definition": graph_definition,
            **additional_config
        }

        # Add checkpointer if specified
        if sqlite_checkpointer:
            checkpointer = SqliteCheckpointConfig(
                type="sqlite",
                db_url=f"sqlite:///{sqlite_checkpointer}"
            )
            agent_config_dict["checkpointer"] = checkpointer

        # Create and validate the LangGraph config
        langgraph_config = LangGraphAgentConfig.model_validate(agent_config_dict)

        # Create the agent config
        self._agent_config = AgentConfig(
            type="langgraph",
            config=langgraph_config.model_dump()
        )
        return self

    def with_custom_agent(
        self,
        agent_type: str,
        config: dict[str, Any]
    ) -> "ConfigBuilder":
        """
        Configure a custom agent type.
        
        This method allows for configuring agent types that don't have
        dedicated builder methods yet. The config will be validated
        when the AgentConfig is created.
        
        Args:
            agent_type: The type of agent (e.g., "crewai", "autogen")
            config: Configuration dictionary specific to the agent type
            
        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        self._agent_config = AgentConfig(
            type=agent_type,
            config=config
        )
        return self

    def build(self) -> EngineConfig:
        """
        Build and return the complete configuration as a validated Pydantic model.
        
        Returns:
            EngineConfig: The complete, validated configuration object
            
        Raises:
            ValueError: If the configuration is incomplete or invalid
        """
        if not self._agent_config:
            raise ValueError("Agent configuration is required. Use with_langgraph_agent() or with_custom_agent()")

        # Create and validate the complete configuration
        return EngineConfig(
            server=self._server_config,
            agent=self._agent_config
        )

    def build_dict(self) -> dict[str, Any]:
        """
        Build and return the configuration as a dictionary.
        
        This is a convenience method for backward compatibility.
        
        Returns:
            Dict[str, Any]: The complete configuration dictionary
        """
        engine_config = self.build()
        return engine_config.model_dump()

    def save_to_file(self, file_path: str) -> None:
        """
        Save the configuration to a YAML file.
        
        Args:
            file_path: Path where to save the configuration file
        """
        config = self.build_dict()
        with open(file_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False, indent=2)

    async def build_and_initialize_agent(self) -> BaseAgent:
        """
        Build configuration and initialize the agent in one step.
        
        Returns:
            BaseAgent: Initialized agent instance
            
        Raises:
            ValueError: If agent type is unsupported or configuration is invalid
        """
        engine_config = self.build()
        return await self.initialize_agent_from_config(engine_config)

    @staticmethod
    async def initialize_agent_from_config(engine_config: EngineConfig) -> BaseAgent:
        """
        Initialize an agent instance from a validated EngineConfig.
        
        Args:
            engine_config: Validated configuration object
            
        Returns:
            BaseAgent: Initialized agent instance
            
        Raises:
            ValueError: If agent type is unsupported
        """
        agent_config_dict = engine_config.agent.config
        print(engine_config)
        agent_type = engine_config.agent.type

        # Initialize the appropriate agent
        agent_instance = None
        if agent_type == "langgraph":
            from ..agent.langgraph.langgraph import LanggraphAgent
            agent_instance = LanggraphAgent()
        elif agent_type == "CREWAI":
            from ..agent.crewai.crewai import CrewAIAgent
            agent_instance = CrewAIAgent()
        # Future agent types can be added here:
        # elif agent_type == "crewai":
        #     from ..agent.crewai.agent import CrewAIAgent
        #     agent_instance = CrewAIAgent()
        # elif agent_type == "autogen":
        #     from ..agent.autogen.agent import AutoGenAgent
        #     agent_instance = AutoGenAgent()
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")

        # Initialize the agent with its configuration
        await agent_instance.initialize(agent_config_dict)
        return agent_instance

    @staticmethod
    def get_agent_class(agent_type: str) -> type[BaseAgent]:
        """
        Get the agent class for a given agent type without initializing it.
        
        Args:
            agent_type: The type of agent
            
        Returns:
            Type[BaseAgent]: The agent class
            
        Raises:
            ValueError: If agent type is unsupported
        """
        if agent_type == "langgraph":
            from ..agent.langgraph.langgraph import LanggraphAgent
            return LanggraphAgent
        elif agent_type == "CREWAI":
            from ..agent.crewai.crewai import CrewAIAgent
            return CrewAIAgent
        # Future agent types can be added here:
        # elif agent_type == "crewai":
        #     from ..agent.crewai.agent import CrewAIAgent
        #     return CrewAIAgent
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")

    @staticmethod
    def validate_agent_config(agent_type: str, config: dict[str, Any]) -> dict[str, Any]:
        """
        Validate agent configuration against the appropriate Pydantic model.
        
        Args:
            agent_type: The type of agent
            config: Configuration dictionary to validate
            
        Returns:
            Dict[str, Any]: Validated configuration dictionary
            
        Raises:
            ValueError: If agent type is unsupported or config is invalid
        """
        if agent_type == "langgraph":
            validated_config = LangGraphAgentConfig.model_validate(config)
            return validated_config.model_dump()
        # Future agent types can be added here:
        # elif agent_type == "crewai":
        #     validated_config = CrewAIAgentConfig.model_validate(config)
        #     return validated_config.model_dump()
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")

    @staticmethod
    def load_from_file(config_path: str = "config.yaml") -> EngineConfig:
        """
        Load configuration from a YAML file and return a validated EngineConfig.
        
        Args:
            config_path: Path to the configuration YAML file
            
        Returns:
            EngineConfig: Validated configuration object
            
        Raises:
            FileNotFoundError: If the configuration file doesn't exist
            ValidationError: If the configuration is invalid
        """
        path = Path(config_path)
        if not path.is_absolute():
            # Resolve relative to the current working directory
            path = Path.cwd() / path

        with open(path) as f:
            config_data = yaml.safe_load(f)

        return EngineConfig.model_validate(config_data)

    @staticmethod
    async def load_and_initialize_agent(config_path: str = "config.yaml") -> tuple[EngineConfig, BaseAgent]:
        """
        Load configuration and initialize agent in one step.
        
        Args:
            config_path: Path to the configuration YAML file
            
        Returns:
            tuple[EngineConfig, BaseAgent]: Configuration and initialized agent
        """
        engine_config = ConfigBuilder.load_from_file(config_path)
        agent = await ConfigBuilder.initialize_agent_from_config(engine_config)
        return engine_config, agent

    @staticmethod
    def resolve_config(
        config_path: str | None = None,
        config_dict: dict[str, Any] | None = None,
        engine_config: EngineConfig | None = None
    ) -> EngineConfig:
        """
        Umbrella function to resolve configuration from various sources.
        
        This function handles all the different ways configuration can be provided
        and returns a validated EngineConfig. It follows a priority order:
        1. engine_config (pre-validated EngineConfig from ConfigBuilder)
        2. config_dict (dictionary to be validated)
        3. config_path (file path to load and validate)
        4. default "config.yaml" file
        
        Args:
            config_path: Path to a YAML configuration file
            config_dict: Dictionary containing configuration
            engine_config: Pre-validated EngineConfig instance
            
        Returns:
            EngineConfig: Validated configuration object
            
        Raises:
            FileNotFoundError: If config file doesn't exist
            ValidationError: If configuration is invalid
        """
        if engine_config:
            # Use pre-validated EngineConfig (from ConfigBuilder)
            print("✅ Using pre-validated EngineConfig")
            return engine_config
        elif config_dict:
            # Validate dictionary config
            print("✅ Validated dictionary configuration")
            return EngineConfig.model_validate(config_dict)
        elif config_path:
            # Load from file using ConfigBuilder
            print(f"✅ Loaded configuration from {config_path}")
            return ConfigBuilder.load_from_file(config_path)
        else:
            # Default to loading config.yaml
            print("✅ Loaded default configuration from config.yaml")
            return ConfigBuilder.load_from_file("config.yaml")

    @classmethod
    def from_dict(cls, config_dict: dict[str, Any]) -> "ConfigBuilder":
        """
        Create a ConfigBuilder from an existing configuration dictionary.
        
        This method validates the input dictionary against the Pydantic models.
        
        Args:
            config_dict: Existing configuration dictionary
            
        Returns:
            ConfigBuilder: A new builder instance with the provided configuration
            
        Raises:
            ValidationError: If the configuration dictionary is invalid
        """
        # Validate the entire config first
        engine_config = EngineConfig.model_validate(config_dict)

        # Create a new builder
        builder = cls()
        builder._server_config = engine_config.server
        builder._agent_config = engine_config.agent

        return builder

    @classmethod
    def from_file(cls, config_path: str = "config.yaml") -> "ConfigBuilder":
        """
        Create a ConfigBuilder from a YAML configuration file.
        
        Args:
            config_path: Path to the configuration YAML file
            
        Returns:
            ConfigBuilder: A new builder instance with the loaded configuration
        """
        engine_config = cls.load_from_file(config_path)
        return cls.from_engine_config(engine_config)

    @classmethod
    def from_engine_config(cls, engine_config: EngineConfig) -> "ConfigBuilder":
        """
        Create a ConfigBuilder from an existing EngineConfig instance.
        
        Args:
            engine_config: Existing EngineConfig instance
            
        Returns:
            ConfigBuilder: A new builder instance with the provided configuration
        """
        builder = cls()
        builder._server_config = engine_config.server
        builder._agent_config = engine_config.agent
        return builder
