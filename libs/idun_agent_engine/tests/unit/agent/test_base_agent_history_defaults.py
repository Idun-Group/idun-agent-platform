"""Default ``BaseAgent`` history methods.

Confirms the contract for adapters that DO NOT override session-history:
``history_capabilities()`` returns all-false, and the listing / lookup
methods raise ``NotImplementedError`` instead of silently returning empty
results. Concrete adapters that DO support history (ADK, LangGraph)
cover the supported paths in their own integration test files
(SES.2 + SES.3).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

import pytest
from ag_ui.core import BaseEvent
from ag_ui.core.types import RunAgentInput
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.capabilities import (
    AgentCapabilities,
    CapabilityFlags,
    InputDescriptor,
    OutputDescriptor,
)
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from idun_agent_schema.engine.sessions import HistoryCapabilities

from idun_agent_engine.agent.base import BaseAgent


class _StubAgent(BaseAgent):
    """Minimal subclass that satisfies the abstract methods with no-ops."""

    @property
    def id(self) -> str:
        return "stub"

    @property
    def agent_type(self) -> str:
        return "stub"

    @property
    def agent_instance(self) -> Any:
        return None

    @property
    def copilotkit_agent_instance(self) -> Any:
        return None

    @property
    def infos(self) -> dict[str, Any]:
        return {}

    async def initialize(
        self,
        config: dict[str, Any],
        observability: list[ObservabilityConfig] | None = None,
    ) -> None:
        return None

    async def invoke(self, message: Any) -> Any:
        return None

    async def stream(self, message: Any) -> AsyncGenerator[Any]:
        if False:  # pragma: no cover
            yield  # type: ignore[unreachable]

    def discover_capabilities(self) -> AgentCapabilities:
        return AgentCapabilities(
            version="1",
            framework=AgentFramework.CUSTOM,
            capabilities=CapabilityFlags(
                streaming=False, history=False, thread_id=False
            ),
            input=InputDescriptor(mode="chat", schema_=None),
            output=OutputDescriptor(mode="text", schema_=None),
        )

    async def run(self, input_data: RunAgentInput) -> AsyncGenerator[BaseEvent]:
        if False:  # pragma: no cover
            yield  # type: ignore[unreachable]


def test_history_capabilities_default_all_false() -> None:
    agent = _StubAgent()
    caps = agent.history_capabilities()
    assert isinstance(caps, HistoryCapabilities)
    assert caps.can_list is False
    assert caps.can_get is False


@pytest.mark.asyncio
async def test_list_sessions_default_raises_not_implemented() -> None:
    agent = _StubAgent()
    with pytest.raises(NotImplementedError):
        await agent.list_sessions()


@pytest.mark.asyncio
async def test_get_session_default_raises_not_implemented() -> None:
    agent = _StubAgent()
    with pytest.raises(NotImplementedError):
        await agent.get_session("any-id")
