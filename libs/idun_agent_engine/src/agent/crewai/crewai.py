from __future__ import annotations

from typing import Any, Dict, Optional, AsyncGenerator
from src.agent.base import BaseAgent
from src.agent.model import BaseAgentConfig


class CrewAIAgent(BaseAgent[BaseAgentConfig]):
    """Placeholder for a future CrewAI agent implementation.

    NotImplemented on purpose to reserve structure and integration points.
    """

    def __init__(self) -> None:
        self._configuration: Optional[BaseAgentConfig] = None

    @property
    def id(self) -> str:  # pragma: no cover - placeholder
        raise NotImplementedError

    @property
    def agent_type(self) -> str:  # pragma: no cover - placeholder
        return "CrewAI"

    @property
    def agent_instance(self) -> Any:  # pragma: no cover - placeholder
        raise NotImplementedError

    @property
    def infos(self) -> Dict[str, Any]:  # pragma: no cover - placeholder
        return {"status": "NotImplemented"}

    async def initialize(self, config: Dict[str, Any]) -> None:  # pragma: no cover - placeholder
        raise NotImplementedError("CrewAIAgent is not implemented yet")

    async def invoke(self, message: Any) -> Any:  # pragma: no cover - placeholder
        raise NotImplementedError("CrewAIAgent is not implemented yet")

    async def stream(self, message: Any) -> AsyncGenerator[Any, None]:  # pragma: no cover - placeholder
        raise NotImplementedError("CrewAIAgent is not implemented yet")



