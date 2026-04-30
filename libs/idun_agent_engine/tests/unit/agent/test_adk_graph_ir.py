"""Tests for AdkAgent graph introspection — single agent + tools cases."""

from __future__ import annotations

from pathlib import Path

import pytest
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)

from idun_agent_engine.core.config_builder import ConfigBuilder


def _adk_config(agent_var: str) -> dict:
    fixture_path = (
        Path(__file__).parent.parent.parent
        / "fixtures"
        / "agents"
        / "mock_adk_agent.py"
    )
    return {
        "agent": {
            "type": "ADK",
            "config": {
                "name": f"adk_{agent_var}",
                "app_name": f"adk_{agent_var}",
                "agent": f"{fixture_path}:{agent_var}",
            },
        },
    }


@pytest.mark.asyncio
async def test_adk_simple_llm_agent() -> None:
    config = ConfigBuilder.from_dict(_adk_config("mock_llm_simple")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    assert isinstance(ir, AgentGraph)
    assert ir.metadata.framework == AgentFramework.ADK
    agent_nodes = [n for n in ir.nodes if isinstance(n, AgentNode)]
    tool_nodes = [n for n in ir.nodes if isinstance(n, ToolNode)]
    assert len(agent_nodes) == 1
    assert len(tool_nodes) == 0
    assert agent_nodes[0].is_root is True
    assert agent_nodes[0].name == "simple"
    assert agent_nodes[0].model == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_adk_llm_with_native_tool() -> None:
    config = ConfigBuilder.from_dict(_adk_config("mock_llm_with_native_tool")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    tool_nodes = [n for n in ir.nodes if isinstance(n, ToolNode)]
    assert len(tool_nodes) == 1
    assert tool_nodes[0].tool_kind == ToolKind.NATIVE
    # one tool_attach edge exists
    attach_edges = [e for e in ir.edges if e.kind == EdgeKind.TOOL_ATTACH]
    assert len(attach_edges) == 1
