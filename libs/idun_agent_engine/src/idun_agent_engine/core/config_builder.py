"""Configuration Builder for Idun Agent Engine.

This module provides a fluent API for building configuration objects using Pydantic models.
This approach ensures type safety, validation, and consistency with the rest of the codebase.
"""

import os
from pathlib import Path
from typing import Any

from idun_agent_schema.engine.guardrails import Guardrails as GuardrailsV1
import yaml
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.haystack import HaystackAgentConfig
from idun_agent_schema.engine.langgraph import (
    LangGraphAgentConfig,
    SqliteCheckpointConfig,
)
from idun_agent_schema.engine.adk import AdkAgentConfig
from idun_agent_schema.engine.mcp_server import MCPServer
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from idun_agent_schema.engine.guardrails_v2 import GuardrailsV2 as Guardrails
from idun_agent_engine.server.server_config import ServerAPIConfig
from yaml import YAMLError

from ..agent.base import BaseAgent
from .engine_config import AgentConfig, EngineConfig, ServerConfig


class ConfigBuilder:
    """A fluent builder for creating Idun Agent Engine configurations using Pydantic models.

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
        self._mcp_servers: list[MCPServer] | None = None
        self._observability: list[ObservabilityConfig] | None = None
        self._guardrails: Guardrails | None = None

    def with_api_port(self, port: int) -> "ConfigBuilder":
        """Set the API port for the server.

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

    def with_server_config(
        self, api_port: int | None = None, telemetry_provider: str | None = None
    ) -> "ConfigBuilder":
        """Set server configuration options directly.

        Args:
            api_port: Optional API port
            telemetry_provider: Optional telemetry provider

        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        api_config = (
            ServerAPIConfig(port=api_port) if api_port else self._server_config.api
        )

        self._server_config = ServerConfig(api=api_config)
        return self

    def with_config_from_api(self, agent_api_key: str, url: str) -> "ConfigBuilder":
        """Fetches the yaml config file, from idun agent manager api.

        Requires the agent api key to pass in the headers.
        """
        import requests
        import yaml

        headers = {"auth": f"Bearer {agent_api_key}"}
        try:
            print(f"Fetching config from {url + '/api/v1/agents/config'}")
            response = requests.get(url=url + "/api/v1/agents/config", headers=headers)
            if response.status_code != 200:
                raise ValueError(
                    f"Error sending retrieving config from url. response : {response.json()}"
                )
            yaml_config = yaml.safe_load(response.text)
            try:
                self._server_config = yaml_config.get("engine_config", {}).get("server")
            except Exception as e:
                raise YAMLError(
                    f"Failed to parse yaml file for  ServerConfig: {e}"
                ) from e
            try:
                self._agent_config = yaml_config.get("engine_config", {}).get("agent")
            except Exception as e:
                raise YAMLError(
                    f"Failed to parse yaml file for Engine config: {e}"
                ) from e
            try:
                guardrails_data = yaml_config.get("engine_config", {}).get("guardrails")

                if not guardrails_data:
                    self._guardrails = None
                else:
                    self._guardrails = Guardrails.model_validate(guardrails_data)
                    self._guardrails.hydrate_api_keys()

            except Exception as e:
                raise YAMLError(f"Failed to parse yaml file for Guardrails: {e}") from e

            try:
                observability_list = yaml_config.get("engine_config", {}).get(
                    "observability"
                )
                if observability_list:
                    self._observability = [
                        ObservabilityConfig.model_validate(obs)
                        for obs in observability_list
                    ]
                else:
                    self._observability = None
            except Exception as e:
                raise YAMLError(
                    f"Failed to parse yaml file for Observability: {e}"
                ) from e
            # try:
            #     mcp_servers_list = yaml_config.get("engine_config", {}).get("mcp_servers") or yaml_config.get("engine_config", {}).get("mcpServers") # TODO to fix camelcase issues
            #     if mcp_servers_list:
            #         self._mcp_servers = [
            #             MCPServer.model_validate(server) for server in mcp_servers_list
            #         ]
            #     else:
            #         self._mcp_servers = None
            # except Exception as e:
            #     raise YAMLError(f"Failed to parse yaml file for MCP Servers: {e}") from e

            return self

        except Exception as e:
            raise ValueError(f"Error occured while getting config from api: {e}") from e

    def with_langgraph_agent(
        self,
        name: str,
        graph_definition: str,
        sqlite_checkpointer: str | None = None,
        **additional_config,
    ) -> "ConfigBuilder":
        """Configure a LangGraph agent using the LangGraphAgentConfig model.

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
            **additional_config,
        }

        # Add checkpointer if specified
        if sqlite_checkpointer:
            checkpointer = SqliteCheckpointConfig(
                type="sqlite", db_url=f"sqlite:///{sqlite_checkpointer}"
            )
            agent_config_dict["checkpointer"] = checkpointer

        # Create and validate the LangGraph config
        langgraph_config = LangGraphAgentConfig.model_validate(agent_config_dict)

        # Create the agent config (store as strongly-typed model, not dict)
        self._agent_config = AgentConfig(
            type=AgentFramework.LANGGRAPH, config=langgraph_config
        )
        return self

    # TODO: remove unused fns

    def with_custom_agent(
        self, agent_type: str, config: dict[str, Any]
    ) -> "ConfigBuilder":
        """Configure a custom agent type.

        This method allows for configuring agent types that don't have
        dedicated builder methods yet. The config will be validated
        when the AgentConfig is created.

        Args:
            agent_type: The type of agent (e.g., "crewai", "autogen")
            config: Configuration dictionary specific to the agent type

        Returns:
            ConfigBuilder: This builder instance for method chaining
        """
        if agent_type == AgentFramework.LANGGRAPH:
            self._agent_config = AgentConfig(
                type=AgentFramework.LANGGRAPH,
                config=LangGraphAgentConfig.model_validate(config),
            )

        elif agent_type == AgentFramework.HAYSTACK:
            self._agent_config = AgentConfig(
                type=AgentFramework.HAYSTACK,
                config=HaystackAgentConfig.model_validate(config),
            )
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")
        return self

    def build(self) -> EngineConfig:
        """Build and return the complete configuration as a validated Pydantic model.

        Returns:
            EngineConfig: The complete, validated configuration object

        Raises:
            ValueError: If the configuration is incomplete or invalid
        """
        if not self._agent_config:
            raise ValueError(
                "Agent configuration is required. Use with_langgraph_agent() or with_custom_agent()"
            )

        # Create and validate the complete configuration
        return EngineConfig(
            server=self._server_config,
            agent=self._agent_config,
            guardrails=self._guardrails,
            observability=self._observability,
            mcp_servers=self._mcp_servers,
        )

    def build_dict(self) -> dict[str, Any]:
        """Build and return the configuration as a dictionary.

        This is a convenience method for backward compatibility.

        Returns:
            Dict[str, Any]: The complete configuration dictionary
        """
        engine_config = self.build()
        return engine_config.model_dump()

    def save_to_file(self, file_path: str) -> None:
        """Save the configuration to a YAML file.

        Args:
            file_path: Path where to save the configuration file
        """
        config = self.build_dict()
        with open(file_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False, indent=2)

    async def build_and_initialize_agent(
        self, mcp_registry: Any | None = None
    ) -> BaseAgent:
        """Build configuration and initialize the agent in one step.

        Returns:
            BaseAgent: Initialized agent instance

        Raises:
            ValueError: If agent type is unsupported or configuration is invalid
        """
        engine_config = self.build()
        return await self.initialize_agent_from_config(
            engine_config, mcp_registry=mcp_registry
        )

    @staticmethod
    async def initialize_agent_from_config(
        engine_config: EngineConfig, mcp_registry: Any | None = None
    ) -> BaseAgent:
        """Initialize an agent instance from a validated EngineConfig.

        Args:
            engine_config: Validated configuration object
            mcp_registry: Optional MCP registry client.

        Returns:
            BaseAgent: Initialized agent instance

        Raises:
            ValueError: If agent type is unsupported
        """
        agent_config_obj = engine_config.agent.config
        agent_type = engine_config.agent.type
        observability_config = engine_config.observability
        # mcp_servers = engine_config.mcp_servers
        # Initialize the appropriate agent
        agent_instance = None
        if agent_type == AgentFramework.LANGGRAPH:
            from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
            import os

            print("Current directory: ", os.getcwd())  # TODO remove
            try:
                validated_config = LangGraphAgentConfig.model_validate(agent_config_obj)

            except Exception as e:
                raise ValueError(
                    f"Cannot validate into a LangGraphAgentConfig model. Got {agent_config_obj}"
                ) from e

            agent_instance = LanggraphAgent()

        elif agent_type == AgentFramework.TRANSLATION_AGENT:
            from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
            from idun_agent_schema.engine.templates import TranslationAgentConfig
            import os

            try:
                translation_config = TranslationAgentConfig.model_validate(
                    agent_config_obj
                )
            except Exception as e:
                raise ValueError(
                    f"Cannot validate into a TranslationAgentConfig model. Got {agent_config_obj}"
                ) from e

            # Configure environment for the template
            os.environ["TRANSLATION_MODEL"] = translation_config.model_name
            os.environ["TRANSLATION_SOURCE_LANG"] = translation_config.source_lang
            os.environ["TRANSLATION_TARGET_LANG"] = translation_config.target_lang

            # Create LangGraph config for the template
            validated_config = LangGraphAgentConfig(
                name=translation_config.name,
                graph_definition="idun_agent_engine.templates.translation:graph",
                input_schema_definition=translation_config.input_schema_definition,
                output_schema_definition=translation_config.output_schema_definition,
                observability=translation_config.observability,
                checkpointer=translation_config.checkpointer,
            )
            agent_instance = LanggraphAgent()

        elif agent_type == AgentFramework.CORRECTION_AGENT:
            from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
            from idun_agent_schema.engine.templates import CorrectionAgentConfig
            import os

            try:
                correction_config = CorrectionAgentConfig.model_validate(
                    agent_config_obj
                )
            except Exception as e:
                raise ValueError(
                    f"Cannot validate into a CorrectionAgentConfig model. Got {agent_config_obj}"
                ) from e

            os.environ["CORRECTION_MODEL"] = correction_config.model_name
            os.environ["CORRECTION_LANGUAGE"] = correction_config.language

            validated_config = LangGraphAgentConfig(
                name=correction_config.name,
                graph_definition="idun_agent_engine.templates.correction:graph",
                input_schema_definition=correction_config.input_schema_definition,
                output_schema_definition=correction_config.output_schema_definition,
                observability=correction_config.observability,
                checkpointer=correction_config.checkpointer,
            )
            agent_instance = LanggraphAgent()

        elif agent_type == AgentFramework.DEEP_RESEARCH_AGENT:
            from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent
            from idun_agent_schema.engine.templates import DeepResearchAgentConfig
            import os

            try:
                deep_research_config = DeepResearchAgentConfig.model_validate(
                    agent_config_obj
                )
            except Exception as e:
                raise ValueError(
                    f"Cannot validate into a DeepResearchAgentConfig model. Got {agent_config_obj}"
                ) from e

            os.environ["DEEP_RESEARCH_MODEL"] = deep_research_config.model_name
            os.environ["DEEP_RESEARCH_PROMPT"] = deep_research_config.system_prompt
            os.environ["TAVILY_API_KEY"] = deep_research_config.tavily_api_key

            validated_config = LangGraphAgentConfig(
                name=deep_research_config.name,
                graph_definition="idun_agent_engine.templates.deep_research:graph",
                input_schema_definition=deep_research_config.input_schema_definition,
                output_schema_definition=deep_research_config.output_schema_definition,
                observability=deep_research_config.observability,
                checkpointer=deep_research_config.checkpointer,
            )
            agent_instance = LanggraphAgent()

        elif agent_type == AgentFramework.HAYSTACK:
            from idun_agent_engine.agent.haystack.haystack import HaystackAgent

            try:
                validated_config = HaystackAgentConfig.model_validate(agent_config_obj)

            except Exception as e:
                raise ValueError(
                    f"Cannot validate into a HaystackAgentConfig model. Got {agent_config_obj}"
                ) from e
            agent_instance = HaystackAgent()
        elif agent_type == AgentFramework.ADK:
            from idun_agent_engine.agent.adk.adk import AdkAgent

            try:
                validated_config = AdkAgentConfig.model_validate(agent_config_obj)
            except Exception as e:
                raise ValueError(
                    f"Cannot validate into a AdkAgentConfig model. Got {agent_config_obj}"
                ) from e
            agent_instance = AdkAgent()
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")

        # Initialize the agent with its configuration
        await agent_instance.initialize(
            validated_config,
            observability_config,  # , mcp_registry=mcp_registry
        )  # type: ignore[arg-type]
        return agent_instance

    @staticmethod
    def get_agent_class(agent_type: str) -> type[BaseAgent]:
        """Get the agent class for a given agent type without initializing it.

        Args:
            agent_type: The type of agent

        Returns:
            Type[BaseAgent]: The agent class

        Raises:
            ValueError: If agent type is unsupported
        """
        if (
            agent_type == "langgraph"
            or agent_type == AgentFramework.LANGGRAPH
            or agent_type == AgentFramework.TRANSLATION_AGENT
            or agent_type == AgentFramework.CORRECTION_AGENT
            or agent_type == AgentFramework.DEEP_RESEARCH_AGENT
        ):
            from ..agent.langgraph.langgraph import LanggraphAgent

            return LanggraphAgent

        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")

    @staticmethod
    def validate_agent_config(
        agent_type: str, config: dict[str, Any]
    ) -> dict[str, Any]:
        """Validate agent configuration against the appropriate Pydantic model.

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
        elif agent_type == AgentFramework.TRANSLATION_AGENT:
            from idun_agent_schema.engine.templates import TranslationAgentConfig

            validated_config = TranslationAgentConfig.model_validate(config)
            return validated_config.model_dump()
        elif agent_type == AgentFramework.CORRECTION_AGENT:
            from idun_agent_schema.engine.templates import CorrectionAgentConfig

            validated_config = CorrectionAgentConfig.model_validate(config)
            return validated_config.model_dump()
        elif agent_type == AgentFramework.DEEP_RESEARCH_AGENT:
            from idun_agent_schema.engine.templates import DeepResearchAgentConfig

            validated_config = DeepResearchAgentConfig.model_validate(config)
            return validated_config.model_dump()
        else:
            raise ValueError(f"Unsupported agent type: {agent_type}")

    @staticmethod
    def load_from_file(config_path: str = "config.yaml") -> EngineConfig:
        """Load configuration from a YAML file and return a validated EngineConfig.

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

        engine_config = EngineConfig.model_validate(config_data)

        if engine_config.guardrails:
            engine_config.guardrails.hydrate_api_keys()

        return engine_config

    @staticmethod
    async def load_and_initialize_agent(
        config_path: str = "config.yaml",
        mcp_registry: Any | None = None,
    ) -> tuple[EngineConfig, BaseAgent]:
        """Load configuration and initialize agent in one step.

        Args:
            config_path: Path to the configuration YAML file
            mcp_registry: Optional MCP registry client.

        Returns:
            tuple[EngineConfig, BaseAgent]: Configuration and initialized agent
        """
        engine_config = ConfigBuilder.load_from_file(config_path)
        agent = await ConfigBuilder.initialize_agent_from_config(
            engine_config, mcp_registry=mcp_registry
        )
        return engine_config, agent

    @staticmethod
    def resolve_config(
        config_path: str | None = None,
        config_dict: dict[str, Any] | None = None,
        engine_config: EngineConfig | None = None,
    ) -> EngineConfig:
        print(config_dict)
        """Umbrella function to resolve configuration from various sources.

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
            # Load from file using ConfigB/uilder
            print(f"✅ Loaded configuration from {config_path}")
            return ConfigBuilder.load_from_file(config_path)
        else:
            # Default to loading config.yaml
            print("✅ Loaded default configuration from config.yaml")
            return ConfigBuilder.load_from_file("config.yaml")

    @classmethod
    def from_dict(cls, config_dict: dict[str, Any]) -> "ConfigBuilder":
        """Create a ConfigBuilder from an existing configuration dictionary.

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
        builder._guardrails = engine_config.guardrails
        builder._observability = engine_config.observability
        builder._mcp_servers = engine_config.mcp_servers
        return builder

    @classmethod
    def from_file(cls, config_path: str = "config.yaml") -> "ConfigBuilder":
        """Create a ConfigBuilder from a YAML configuration file.

        Args:
            config_path: Path to the configuration YAML file

        Returns:
            ConfigBuilder: A new builder instance with the loaded configuration
        """
        engine_config = cls.load_from_file(config_path)
        return cls.from_engine_config(engine_config)

    @classmethod
    def from_engine_config(cls, engine_config: EngineConfig) -> "ConfigBuilder":
        """Create a ConfigBuilder from an existing EngineConfig instance.

        Args:
            engine_config: Existing EngineConfig instance

        Returns:
            ConfigBuilder: A new builder instance with the provided configuration
        """
        builder = cls()
        builder._server_config = engine_config.server
        builder._agent_config = engine_config.agent
        builder._guardrails = engine_config.guardrails
        builder._observability = engine_config.observability
        builder._mcp_servers = engine_config.mcp_servers

        return builder
