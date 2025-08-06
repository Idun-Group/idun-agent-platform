from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, AsyncGenerator, TypeVar, Generic
from .base_agent_config import BaseAgentConfig

ConfigType = TypeVar("ConfigType", bound=BaseAgentConfig)

class BaseAgent(ABC, Generic[ConfigType]):
    """
    Abstract Base Class defining the common interface for all agents frameworks
    pluggable into the Idun Agent SDK.
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
        """The underlying agent instance from the specific framework (e.g., a LangGraph runnable).
        This might be set after initialization.
        """
        pass

    @property
    def configuration(self) -> ConfigType:
        """Configuration settings for the agent.
        This is typically the configuration used during initialization.
        """
        return self._configuration

    @property
    @abstractmethod
    def infos(self) -> Dict[str, Any]:
        """General information about the agent instance (e.g., version, status, metadata)."""
        pass

    @abstractmethod
    async def initialize(self, config: Dict[str, Any]) -> None:
        """Initializes the agent with a given configuration.
        This method should set up the underlying agent framework instance.
        Args:
            config: A dictionary containing the agent's configuration.
        """
        pass

    @abstractmethod
    async def invoke(self, message: Any) -> Any:
        """Processes a single input message and returns a response.
        This should be an awaitable method if the underlying agent processes asynchronously.
        Args:
            message: The input message for the agent.
        Returns:
            The agent's response.
        """
        pass

    @abstractmethod
    async def stream(self, message: Any) -> AsyncGenerator[Any, None]:
        """Processes a single input message and returns an asynchronous stream of responses.
        Args:
            message: The input message for the agent.
        Yields:
            Chunks of the agent's response.
        """
        # This is an async generator, so it needs `async def` and `yield`
        # For the ABC, we can't have a `yield` directly in the abstract method body.
        # The signature itself defines it as an async generator.
        # Example: async for chunk in agent.stream(message): ...
        if False: # pragma: no cover (This is just to make it a generator type for static analysis)
            yield
