"""Tests for BaseAgent default graph methods (NotImplementedError fallback)."""

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

from idun_agent_engine.agent.base import BaseAgent


class _StubAgent(BaseAgent):
    """Bare BaseAgent subclass that doesn't override graph methods."""

    @property
    def id(self) -> str:
        return "stub"

    @property
    def agent_type(self) -> str:
        return "STUB"

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


def test_get_graph_ir_default_raises_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        _StubAgent().get_graph_ir()


def test_draw_mermaid_default_raises_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        _StubAgent().draw_mermaid()


def test_draw_ascii_default_raises_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        _StubAgent().draw_ascii()
