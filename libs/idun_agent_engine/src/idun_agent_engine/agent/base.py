"""Agent base interfaces.

Defines the abstract `BaseAgent` used by all agent implementations.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any

from ag_ui.core import BaseEvent
from ag_ui.core.types import RunAgentInput
from idun_agent_schema.engine.agent import BaseAgentConfig
from idun_agent_schema.engine.capabilities import AgentCapabilities
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from idun_agent_schema.engine.sessions import (
    HistoryCapabilities,
    SessionDetail,
    SessionSummary,
)

from idun_agent_engine.agent.observers import (
    RunEventObserver,
    RunEventObserverRegistry,
)


class BaseAgent[ConfigType: BaseAgentConfig](ABC):
    """Abstract base for agents pluggable into the Idun Agent Engine.

    Implements the public protocol that concrete agent adapters must follow.
    """

    _configuration: ConfigType

    def __init__(self) -> None:
        """Initialize shared agent state.

        Subclasses must call ``super().__init__()`` to populate the
        run-event observer registry.
        """
        self.run_event_observers: RunEventObserverRegistry = RunEventObserverRegistry()

    def register_run_event_observer(self, observer: RunEventObserver) -> None:
        """Register an async observer for run events."""
        self.run_event_observers.register(observer)

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
    async def initialize(
        self,
        config: dict[str, Any],
        observability: list[ObservabilityConfig] | None = None,
    ) -> None:
        """Initialize the agent with a given configuration.

        This method should set up the underlying agent framework instance.

        Args:
            config: A dictionary containing the agent's configuration.
            observability: Optional list of observability configurations.
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
        if (
            False
        ):  # pragma: no cover (This is just to make it a generator type for static analysis)
            yield

    @abstractmethod
    def discover_capabilities(self) -> AgentCapabilities:
        """Return the agent's capability descriptor.

        Called once at startup, result is cached. Adapters introspect
        the underlying framework agent to determine input/output schemas
        and supported capabilities.
        """
        pass

    @abstractmethod
    async def run(self, input_data: RunAgentInput) -> AsyncGenerator[BaseEvent]:
        """Canonical AG-UI interaction entry point.

        Accepts RunAgentInput, yields AG-UI events. Each adapter
        delegates to its framework's AG-UI wrapper and adds structured
        input validation and output extraction on top.
        """
        if False:  # pragma: no cover
            yield  # type: ignore[misc]

    def history_capabilities(self) -> HistoryCapabilities:
        """Declare session-history support for this adapter.

        Default: not supported. Override in concrete adapters that wire a
        memory backend (ADK ``session_service``, LangGraph ``checkpointer``).
        """
        return HistoryCapabilities(can_list=False, can_get=False)

    async def list_sessions(
        self, *, user_id: str | None = None
    ) -> list[SessionSummary]:
        """List sessions visible to ``user_id``.

        Concrete adapters that report ``history_capabilities().can_list``
        as ``True`` must override. The default raises
        ``NotImplementedError`` so misconfiguration surfaces loudly
        instead of silently returning empty data.
        """
        raise NotImplementedError(
            f"list_sessions not implemented for {type(self).__name__}"
        )

    async def get_session(
        self, session_id: str, *, user_id: str | None = None
    ) -> SessionDetail | None:
        """Return the reconstructed message thread for ``session_id``.

        Concrete adapters that report ``history_capabilities().can_get``
        as ``True`` must override. Returning ``None`` is the
        404-equivalent at the route layer.
        """
        raise NotImplementedError(
            f"get_session not implemented for {type(self).__name__}"
        )
