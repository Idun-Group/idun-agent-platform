"""CrewAI agent adapter (placeholder)."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from idun_agent_engine.agent.base import BaseAgent
from idun_agent_engine.agent.model import BaseAgentConfig


class CrewAIAgent(BaseAgent[BaseAgentConfig]):
    """Placeholder for a future CrewAI agent implementation."""

    def __init__(self) -> None:
        """Initialize placeholder with optional configuration slot."""
        self._configuration: BaseAgentConfig | None = None

    @property
    def id(self) -> str:  # pragma: no cover - placeholder
        """Return unique identifier (not implemented)."""
        raise NotImplementedError

    @property
    def agent_type(self) -> str:  # pragma: no cover - placeholder
        """Return agent type label."""
        return "CrewAI"

    @property
    def agent_instance(self) -> Any:  # pragma: no cover - placeholder
        """Return underlying instance (not implemented)."""
        raise NotImplementedError

    @property
    def infos(self) -> dict[str, Any]:  # pragma: no cover - placeholder
        """Return diagnostic information for placeholder agent."""
        return {"status": "NotImplemented"}

    async def initialize(
        self, config: dict[str, Any]
    ) -> None:  # pragma: no cover - placeholder
        """Initialize agent with provided config (not implemented)."""
        raise NotImplementedError("CrewAIAgent is not implemented yet")

    async def invoke(self, message: Any) -> Any:  # pragma: no cover - placeholder
        """Process a single message (not implemented)."""
        raise NotImplementedError("CrewAIAgent is not implemented yet")

    async def stream(
        self, message: Any
    ) -> AsyncGenerator[Any]:  # pragma: no cover - placeholder
        """Stream responses for a message (not implemented)."""
        raise NotImplementedError("CrewAIAgent is not implemented yet")
