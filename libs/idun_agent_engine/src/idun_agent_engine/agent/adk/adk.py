"""ADK agent adapter implementing the BaseAgent protocol."""

import importlib.util
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from idun_agent_schema.engine.adk import AdkAgentConfig

from idun_agent_engine.agent import base as agent_base
from ag_ui_adk import ADKAgent



class AdkAgent(agent_base.BaseAgent):
    """ADK agent adapter implementing the BaseAgent protocol."""

    def __init__(self):
        """Initialize an unconfigured AdkAgent with default state."""
        self._id = str(uuid.uuid4())
        self._agent_type = "ADK"
        self._agent_instance: Any = None
        self._copilotkit_agent_instance: ADKAgent | None = None
        self._configuration: AdkAgentConfig | None = None
        self._name: str = "Unnamed ADK Agent"
        self._infos: dict[str, Any] = {
            "status": "Uninitialized",
            "name": self._name,
            "id": self._id,
        }

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
    def copilotkit_agent_instance(self) -> Any:
        """Return the CopilotKit agent instance.

        Raises:
            NotImplementedError: ADK integration does not currently support CopilotKit.
        """
        raise NotImplementedError("ADK integration does not currently support CopilotKit.")

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

    async def initialize(self, config: AdkAgentConfig) -> None:
        """Initialize the ADK agent asynchronously."""
        self._configuration = AdkAgentConfig.model_validate(config)

        self._name = self._configuration.app_name or "Unnamed ADK Agent"
        self._infos["name"] = self._name

        # TODO: Initialize Session Service
        # self._configuration.session_service

        # TODO: Initialize Memory Service
        # self._configuration.memory_service

        # Load the agent instance
        self._agent_instance = self._load_agent(self._configuration.agent)

        self._infos["status"] = "Initialized"
        self._infos["config_used"] = self._configuration.model_dump()

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

        # TODO: Implement ADK invoke logic
        # 1. Create/Get Session
        # 2. Process message
        # 3. Update state
        # 4. Return response
        raise NotImplementedError("ADK invoke not implemented yet")

    async def stream(self, message: Any) -> AsyncGenerator[Any]:
        """Process a single input message and return an asynchronous stream."""
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        # TODO: Implement ADK stream logic
        raise NotImplementedError("ADK stream not implemented yet")

        # Required to make this a generator
        if False:
            yield
