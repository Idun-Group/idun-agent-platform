from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Generator

class IAgent(ABC):
    """
    Abstract Base Class defining the common interface for all agents
    managed by the AgentManager.
    """

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
    def input_schema(self) -> Any:
        """Defines the expected input data structure for process_message.
        This could be a Pydantic model, a JSON schema, or other type definition.
        """
        pass

    @property
    @abstractmethod
    def output_schema(self) -> Any:
        """Defines the output data structure from process_message.
        This could be a Pydantic model, a JSON schema, or other type definition.
        """
        pass

    @property
    @abstractmethod
    def agent_instance(self) -> Any:
        """The underlying agent instance from the specific framework (e.g., a LangGraph runnable).
        This might be set after initialization.
        """
        pass

    @property
    @abstractmethod
    def configuration(self) -> Dict[str, Any]:
        """Configuration settings for the agent.
        This is typically the configuration used during initialization.
        """
        pass

    @property
    @abstractmethod
    def infos(self) -> Dict[str, Any]:
        """General information about the agent instance (e.g., version, status, metadata)."""
        pass

    @property
    @abstractmethod
    def a2a_card(self) -> Optional[Dict[str, Any]]:
        """Agent-to-Agent Card: Information for agent discovery and interaction.
        Could include capabilities, endpoints, supported schemas, etc.
        """
        pass

    @property
    @abstractmethod
    def a2a_server_details(self) -> Optional[Dict[str, Any]]:
        """Agent-to-Agent Server: Server details if this agent hosts an A2A endpoint.
        Could include URL, port, authentication details, etc.
        """
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
    async def process_message(self, message: Any) -> Any:
        """Processes a single input message and returns a response.
        This should be an awaitable method if the underlying agent processes asynchronously.
        Args:
            message: The input message for the agent.
        Returns:
            The agent's response.
        """
        pass

    @abstractmethod
    async def process_message_stream(self, message: Any) -> Generator[Any, None, None]:
        """Processes a single input message and returns an asynchronous stream of responses.
        Args:
            message: The input message for the agent.
        Yields:
            Chunks of the agent's response.
        """
        # This is an async generator, so it needs `async def` and `yield`
        # For the ABC, we can't have a `yield` directly in the abstract method body.
        # The signature itself defines it as an async generator.
        # Example: async for chunk in agent.process_message_stream(message): ...
        if False: # pragma: no cover (This is just to make it a generator type for static analysis)
            yield

    @abstractmethod
    def get_session(self, session_id: Optional[str] = None) -> Any:
        """Retrieves or establishes a session for the agent.
        This could involve creating a new session or fetching an existing one.
        Args:
            session_id: An optional identifier for the session.
        Returns:
            A session object or identifier.
        """
        pass

    @abstractmethod
    def get_memory(self, session_id: Optional[str] = None) -> Any:
        """Accesses the agent's memory, optionally for a specific session.
        Args:
            session_id: An optional identifier for the session whose memory is to be accessed.
        Returns:
            The agent's memory (or a view of it).
        """
        pass

    @abstractmethod
    def set_observability(self, observability_provider: Any) -> None:
        """Configures observability (logging, tracing, metrics) for the agent.
        Args:
            observability_provider: An instance or configuration for an observability provider.
        """
        pass

    @abstractmethod
    def get_infos(self) -> Dict[str, Any]:
        """Returns detailed information about the agent instance.
        This might be a more comprehensive version of the `infos` property.
        Returns:
            A dictionary containing agent information.
        """
        pass

    @abstractmethod
    def get_workflow(self) -> Any:
        """(If applicable) Returns the definition or representation of the agent's workflow.
        This could be a graph definition, a state machine, etc.
        Returns:
            The agent's workflow representation.
        """
        pass

    @abstractmethod
    def set_a2a_server(self, server_info: Dict[str, Any]) -> None:
        """Configures the agent-to-agent communication server if this agent hosts one.
        Args:
            server_info: A dictionary containing server configuration details.
        """
        pass 