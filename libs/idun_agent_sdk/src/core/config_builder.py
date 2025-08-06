"""
Configuration Builder for Idun Agent SDK

This module provides a fluent API for building configuration objects using Pydantic models.
This approach ensures type safety, validation, and consistency with the rest of the codebase.
"""

from typing import Dict, Any, Optional, Type, Union
from pathlib import Path
import yaml

from ..server.server_config import AppConfig, SDKConfig, AgentConfig, AppAPIConfig, AppTelemetryConfig
from ..agent_frameworks.langgraph_agent_config import LangGraphAgentConfig, SqliteCheckpointConfig
from ..agent_frameworks.base_agent import BaseAgent


class ConfigBuilder:
    """
    A fluent builder for creating Idun Agent SDK configurations using Pydantic models.
    
    This class provides a convenient way to build strongly-typed configuration objects
    that are validated at creation time, ensuring consistency and catching errors early.
    It also handles agent initialization and management.
    
    Example:
        config = (ConfigBuilder()
                 .with_api_port(8080)
                 .with_telemetry("langfuse")
                 .with_langgraph_agent(
                     name="My Agent",
                     graph_definition="my_agent.py:graph",
                     sqlite_checkpointer="agent.db")
                 .build())
        
        app = create_app(config_dict=config.model_dump())
    """
    
    def __init__(self):
        """Initialize a new configuration builder with default values."""
        self._sdk_config = SDKConfig()
        self._agent_config: Optional[AgentConfig] = None
    
    def with_api_port(self, port: int) -> "ConfigBuilder":
        """
        Set the API port for the server.
        
        Args:
            port: The port number to bind the server to
            
        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        # Create new API config with updated port
        api_config = AppAPIConfig(port=port)
        self._sdk_config = SDKConfig(
            api=api_config,
            telemetry=self._sdk_config.telemetry
        )
        return self
    
    def with_telemetry(self, provider: str) -> "ConfigBuilder":
        """
        Set the telemetry provider.
        
        Args:
            provider: The telemetry provider name (e.g., "langfuse", "wandb")
            
        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        # Create new telemetry config with updated provider
        telemetry_config = AppTelemetryConfig(provider=provider)
        self._sdk_config = SDKConfig(
            api=self._sdk_config.api,
            telemetry=telemetry_config
        )
        return self
    
    def with_sdk_config(
        self, 
        api_port: Optional[int] = None,
        telemetry_provider: Optional[str] = None
    ) -> "ConfigBuilder":
        """
        Set SDK configuration options directly.
        
        Args:
            api_port: Optional API port
            telemetry_provider: Optional telemetry provider
            
        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        api_config = AppAPIConfig(port=api_port) if api_port else self._sdk_config.api
        telemetry_config = AppTelemetryConfig(provider=telemetry_provider) if telemetry_provider else self._sdk_config.telemetry
        
        self._sdk_config = SDKConfig(api=api_config, telemetry=telemetry_config)
        return self
    
    def with_langgraph_agent(
        self,
        name: str,
        graph_definition: str,
        sqlite_checkpointer: Optional[str] = None,
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
        config: Dict[str, Any]
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
    
    def build(self) -> AppConfig:
        """
        Build and return the complete configuration as a validated Pydantic model.
        
        Returns:
            AppConfig: The complete, validated configuration object
            
        Raises:
            ValueError: If the configuration is incomplete or invalid
        """
        if not self._agent_config:
            raise ValueError("Agent configuration is required. Use with_langgraph_agent() or with_custom_agent()")
        
        # Create and validate the complete configuration
        return AppConfig(
            sdk=self._sdk_config,
            agent=self._agent_config
        )
    
    def build_dict(self) -> Dict[str, Any]:
        """
        Build and return the configuration as a dictionary.
        
        This is a convenience method for backward compatibility.
        
        Returns:
            Dict[str, Any]: The complete configuration dictionary
        """
        app_config = self.build()
        return app_config.model_dump()
    
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
        app_config = self.build()
        return await self.initialize_agent_from_config(app_config)
    
    @staticmethod
    async def initialize_agent_from_config(app_config: AppConfig) -> BaseAgent:
        """
        Initialize an agent instance from a validated AppConfig.
        
        Args:
            app_config: Validated configuration object
            
        Returns:
            BaseAgent: Initialized agent instance
            
        Raises:
            ValueError: If agent type is unsupported
        """
        agent_config_dict = app_config.agent.config
        agent_type = app_config.agent.type

        # Initialize the appropriate agent
        agent_instance = None
        if agent_type == "langgraph":
            from ..agent_frameworks.langgraph_agent import LanggraphAgent
            agent_instance = LanggraphAgent()
        # Future agent types can be added here:
        # elif agent_type == "crewai":
        #     from ..agent_frameworks.crewai_agent import CrewAIAgent
        #     agent_instance = CrewAIAgent()
        # elif agent_type == "autogen":
        #     from ..agent_frameworks.autogen_agent import AutoGenAgent
        #     agent_instance = AutoGenAgent()
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")
        
        # Initialize the agent with its configuration
        await agent_instance.initialize(agent_config_dict)
        return agent_instance
    
    @staticmethod
    def get_agent_class(agent_type: str) -> Type[BaseAgent]:
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
            from ..agent_frameworks.langgraph_agent import LanggraphAgent
            return LanggraphAgent
        # Future agent types can be added here:
        # elif agent_type == "crewai":
        #     from ..agent_frameworks.crewai_agent import CrewAIAgent
        #     return CrewAIAgent
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")
    
    @staticmethod
    def validate_agent_config(agent_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
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
    def load_from_file(config_path: str = "config.yaml") -> AppConfig:
        """
        Load configuration from a YAML file and return a validated AppConfig.
        
        Args:
            config_path: Path to the configuration YAML file
            
        Returns:
            AppConfig: Validated configuration object
            
        Raises:
            FileNotFoundError: If the configuration file doesn't exist
            ValidationError: If the configuration is invalid
        """
        path = Path(config_path)
        if not path.is_absolute():
            # Resolve relative to the current working directory
            path = Path.cwd() / path

        with open(path, 'r') as f:
            config_data = yaml.safe_load(f)
        
        return AppConfig.model_validate(config_data)
    
    @staticmethod
    async def load_and_initialize_agent(config_path: str = "config.yaml") -> tuple[AppConfig, BaseAgent]:
        """
        Load configuration and initialize agent in one step.
        
        Args:
            config_path: Path to the configuration YAML file
            
        Returns:
            tuple[AppConfig, BaseAgent]: Configuration and initialized agent
        """
        app_config = ConfigBuilder.load_from_file(config_path)
        agent = await ConfigBuilder.initialize_agent_from_config(app_config)
        return app_config, agent
    
    @staticmethod
    def resolve_config(
        config_path: Optional[str] = None,
        config_dict: Optional[Dict[str, Any]] = None,
        app_config: Optional[AppConfig] = None
    ) -> AppConfig:
        """
        Umbrella function to resolve configuration from various sources.
        
        This function handles all the different ways configuration can be provided
        and returns a validated AppConfig. It follows a priority order:
        1. app_config (pre-validated AppConfig from ConfigBuilder)
        2. config_dict (dictionary to be validated)
        3. config_path (file path to load and validate)
        4. default "config.yaml" file
        
        Args:
            config_path: Path to a YAML configuration file
            config_dict: Dictionary containing configuration
            app_config: Pre-validated AppConfig instance
            
        Returns:
            AppConfig: Validated configuration object
            
        Raises:
            FileNotFoundError: If config file doesn't exist
            ValidationError: If configuration is invalid
        """
        if app_config:
            # Use pre-validated AppConfig (from ConfigBuilder)
            print("✅ Using pre-validated AppConfig")
            return app_config
        elif config_dict:
            # Validate dictionary config
            print("✅ Validated dictionary configuration")
            return AppConfig.model_validate(config_dict)
        elif config_path:
            # Load from file using ConfigBuilder
            print(f"✅ Loaded configuration from {config_path}")
            return ConfigBuilder.load_from_file(config_path)
        else:
            # Default to loading config.yaml
            print("✅ Loaded default configuration from config.yaml")
            return ConfigBuilder.load_from_file("config.yaml")
    
    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "ConfigBuilder":
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
        app_config = AppConfig.model_validate(config_dict)
        
        # Create a new builder
        builder = cls()
        builder._sdk_config = app_config.sdk
        builder._agent_config = app_config.agent
        
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
        app_config = cls.load_from_file(config_path)
        return cls.from_app_config(app_config)
    
    @classmethod
    def from_app_config(cls, app_config: AppConfig) -> "ConfigBuilder":
        """
        Create a ConfigBuilder from an existing AppConfig instance.
        
        Args:
            app_config: Existing AppConfig instance
            
        Returns:
            ConfigBuilder: A new builder instance with the provided configuration
        """
        builder = cls()
        builder._sdk_config = app_config.sdk
        builder._agent_config = app_config.agent
        return builder 