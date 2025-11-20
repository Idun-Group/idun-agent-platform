"""Agent base interfaces.

Defines the abstract `BaseAgent` used by all agent implementations.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any

from idun_agent_schema.engine.agent import BaseAgentConfig


class BaseAgent[ConfigType: BaseAgentConfig](ABC):
    """Abstract base for agents pluggable into the Idun Agent Engine.

    Implements the public protocol that concrete agent adapters must follow.
    """

    _configuration: ConfigType

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique identifier for the agent instance."""
        pass

    @property
    @abstractmethod
    def agent_type(self) -> str:
        """Type or category of the agent (e.g., 'LangGraph', 'ADK')."""
        pass

    @property
    @abstractmethod
    def agent_instance(self) -> Any:
        """Get the underlying agent instance from the specific framework.

        This might be set after initialization.
        """
        pass

    @property
    @abstractmethod
    def copilotkit_agent_instance(self) -> Any:
        """Get the CopilotKit agent instance.

        This might be set after initialization.
        """
        pass

    @property
    def configuration(self) -> ConfigType:
        """Return current configuration settings for the agent.

        This is typically the configuration used during initialization.
        """
        return self._configuration

    @property
    @abstractmethod
    def infos(self) -> dict[str, Any]:
        """General information about the agent instance (e.g., version, status, metadata)."""
        pass

    @abstractmethod
    async def initialize(self, config: dict[str, Any]) -> None:
        """Initialize the agent with a given configuration.

        This method should set up the underlying agent framework instance.

        Args:
            config: A dictionary containing the agent's configuration.
        """
        pass

    @abstractmethod
    async def invoke(self, message: Any) -> Any:
        """Process a single input message and return a response.

        This should be an awaitable method if the underlying agent processes
        asynchronously.

        Args:
            message: The input message for the agent.

        Returns:
            The agent's response.
        """
        pass

    @abstractmethod
    async def stream(self, message: Any) -> AsyncGenerator[Any]:
        """Process a single input message and return an asynchronous stream.

        Args:
            message: The input message for the agent.

        Yields:
            Chunks of the agent's response.
        """
        # This is an async generator, so it needs `async def` and `yield`
        # For the ABC, we can't have a `yield` directly in the abstract method body.
        # The signature itself defines it as an async generator.
        # Example: async for chunk in agent.stream(message): ...
        if False:  # pragma: no cover (This is just to make it a generator type for static analysis)
            yield
