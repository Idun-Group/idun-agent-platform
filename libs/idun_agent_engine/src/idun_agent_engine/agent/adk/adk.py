"""ADK agent adapter implementing the BaseAgent protocol."""

import importlib.util
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from ag_ui_adk import ADKAgent as ADKAGUIAgent
from google.adk.apps.app import App
from google.adk.memory import (
    InMemoryMemoryService,
    VertexAiMemoryBankService,
)
from google.adk.sessions import (
    DatabaseSessionService,
    InMemorySessionService,
    VertexAiSessionService,
)
from idun_agent_schema.engine.adk import (
    AdkAgentConfig,
    AdkDatabaseSessionConfig,
    AdkInMemoryMemoryConfig,
    AdkInMemorySessionConfig,
    AdkVertexAiMemoryConfig,
    AdkVertexAiSessionConfig,
)
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig

from idun_agent_engine import observability
from idun_agent_engine.agent import base as agent_base


class AdkAgent(agent_base.BaseAgent):
    """ADK agent adapter implementing the BaseAgent protocol."""

    def __init__(self):
        """Initialize an unconfigured AdkAgent with default state."""
        self._id = str(uuid.uuid4())
        self._agent_type = "ADK"
        self._agent_instance: Any = None
        self._copilotkit_agent_instance: ADKAGUIAgent | None = None
        self._configuration: AdkAgentConfig | None = None
        self._name: str = "Unnamed ADK Agent"
        self._infos: dict[str, Any] = {
            "status": "Uninitialized",
            "name": self._name,
            "id": self._id,
        }
        self._session_service: Any = None
        self._memory_service: Any = None
        # Observability (provider-agnostic)
        self._obs_callbacks: list[Any] | None = None

    @property
    def id(self) -> str:
        """Return unique identifier for this agent instance."""
        return self._id

    @property
    def agent_type(self) -> str:
        """Return agent type label."""
        return self._agent_type

    @property
    def name(self) -> str:
        """Return configured human-readable agent name."""
        return self._name

    @property
    def agent_instance(self) -> Any:
        """Return the underlying ADK agent instance.

        Raises:
            RuntimeError: If the agent is not yet initialized.
        """
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")
        return self._agent_instance

    @property
    def copilotkit_agent_instance(self) -> ADKAGUIAgent:
        """Return the CopilotKit agent instance.

        Raises:
            RuntimeError: If the CopilotKit agent is not yet initialized.
        """
        if self._copilotkit_agent_instance is None:
            raise RuntimeError(
                "CopilotKit agent not initialized. Call initialize() first."
            )
        return self._copilotkit_agent_instance

    @property
    def configuration(self) -> AdkAgentConfig:
        """Return validated configuration.

        Raises:
            RuntimeError: If the agent has not been configured yet.
        """
        if not self._configuration:
            raise RuntimeError("Agent not configured. Call initialize() first.")
        return self._configuration

    @property
    def infos(self) -> dict[str, Any]:
        """Return diagnostic information about the agent instance."""
        self._infos["underlying_agent_type"] = (
            str(type(self._agent_instance)) if self._agent_instance else "N/A"
        )
        return self._infos

    async def initialize(
        self,
        config: AdkAgentConfig,
        observability_config: list[ObservabilityConfig] | None = None,
    ) -> None:
        """Initialize the ADK agent asynchronously."""
        self._configuration = AdkAgentConfig.model_validate(config)

        self._name = self._configuration.app_name or "Unnamed ADK Agent"
        self._infos["name"] = self._name

        # Observability (provider-agnostic)
        if observability_config:
            handlers, infos = observability.create_observability_handlers(
                observability_config  # type: ignore[arg-type]
            )
            self._obs_callbacks = []
            for handler in handlers:
                # Even if callbacks aren't used by ADK directly, instantiating the handler
                # might set up global instrumentation (e.g. Phoenix, Langfuse env vars).
                self._obs_callbacks.extend(handler.get_callbacks())

            if infos:
                self._infos["observability"] = infos

        if observability_config:
            try:
                # Check if langfuse is enabled in any of the observability configs
                def _is_langfuse_provider(c: Any) -> bool:
                    provider = getattr(c, "provider", None)
                    if provider is None and isinstance(c, dict):
                        provider = c.get("provider")

                    if provider is not None and hasattr(provider, "value"):
                        provider = provider.value

                    return str(provider).lower() == "langfuse"

                is_langfuse_enabled = any(
                    _is_langfuse_provider(config) for config in observability_config
                )

                if is_langfuse_enabled:
                    import os

                    langfuse_pk = os.environ.get("LANGFUSE_PUBLIC_KEY")
                    langfuse_host = os.environ.get("LANGFUSE_BASE_URL")
                    print(f"LANGFUSE_PUBLIC_KEY: {langfuse_pk}")
                    print(f"LANGFUSE_BASE_URL: {langfuse_host}")
                    try:
                        from openinference.instrumentation.google_adk import (
                            GoogleADKInstrumentor,
                        )

                        GoogleADKInstrumentor().instrument()
                        print("GoogleADKInstrumentor instrumented successfully.")
                    except ImportError:
                        print(
                            "openinference-instrumentation-google-adk not installed, skipping Google ADK instrumentation."
                        )
                    except Exception as e:
                        print(f"Failed to instrument Google ADK: {e}")
            except Exception as e:
                print(
                    f"Error checking observability config for ADK instrumentation: {e}"
                )

        # Initialize Session Service
        await self._initialize_session_service()

        # Initialize Memory Service
        await self._initialize_memory_service()

        # Load the agent instance
        agent = self._load_agent(self._configuration.agent)

        self._agent_instance = App(root_agent=agent, name=self._name)

        # Initialize CopilotKit/AG-UI Agent Wrapper
        # TODO: Pass session and memory services when supported by AG-UI ADK adapter if needed
        self._copilotkit_agent_instance = ADKAGUIAgent(
            adk_agent=agent,
            session_service=self._session_service,
            memory_service=self._memory_service,
            app_name=self._name,
        )

        self._infos["status"] = "Initialized"
        self._infos["config_used"] = self._configuration.model_dump()

    async def _initialize_session_service(self) -> None:
        """Initialize the session service based on configuration."""
        if not self._configuration:
            raise RuntimeError("Configuration not initialized")

        if not self._configuration.session_service:
            # Default to InMemory if not specified
            self._session_service = InMemorySessionService()
            return

        config = self._configuration.session_service
        if isinstance(config, AdkInMemorySessionConfig):
            self._session_service = InMemorySessionService()
        elif isinstance(config, AdkVertexAiSessionConfig):
            self._session_service = VertexAiSessionService(
                project=config.project_id,
                location=config.location,
                agent_engine_id=config.reasoning_engine_app_name,
            )
        elif isinstance(config, AdkDatabaseSessionConfig):
            self._session_service = DatabaseSessionService(db_url=config.db_url)
        else:
            raise ValueError(f"Unsupported session service type: {config.type}")  # type: ignore

    async def _initialize_memory_service(self) -> None:
        """Initialize the memory service based on configuration."""
        if not self._configuration:
            raise RuntimeError("Configuration not initialized")

        if not self._configuration.memory_service:
            # Default to InMemory if not specified
            self._memory_service = InMemoryMemoryService()
            return

        config = self._configuration.memory_service
        if isinstance(config, AdkInMemoryMemoryConfig):
            self._memory_service = InMemoryMemoryService()
        elif isinstance(config, AdkVertexAiMemoryConfig):
            self._memory_service = VertexAiMemoryBankService(
                project=config.project_id,
                location=config.location,
                agent_engine_id=config.memory_bank_id,
            )
        else:
            raise ValueError(f"Unsupported memory service type: {config.type}")  # type: ignore

    def _load_agent(self, agent_definition: str) -> Any:
        """Loads an agent instance from a specified path."""
        try:
            module_path, agent_variable_name = agent_definition.rsplit(":", 1)
        except ValueError:
            raise ValueError(
                "agent_definition must be in the format 'path/to/file.py:variable_name'"
            ) from None

        try:
            from pathlib import Path

            resolved_path = Path(module_path).resolve()
            spec = importlib.util.spec_from_file_location(
                agent_variable_name, str(resolved_path)
            )
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load spec for module at {module_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            agent_instance = getattr(module, agent_variable_name)
            return agent_instance
        except (FileNotFoundError, ImportError, AttributeError) as e:
            raise ValueError(
                f"Failed to load agent from {agent_definition}: {e}"
            ) from e

    async def invoke(self, message: Any) -> Any:
        """Process a single input to chat with the agent."""
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        # TODO: Implement ADK invoke logic using session and memory services
        raise NotImplementedError("ADK invoke not implemented yet")

    async def stream(self, message: Any) -> AsyncGenerator[Any]:
        """Process a single input message and return an asynchronous stream."""
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        # TODO: Implement ADK stream logic using session and memory services
        raise NotImplementedError("ADK stream not implemented yet")

        # Required to make this a generator
        if False:
            yield
