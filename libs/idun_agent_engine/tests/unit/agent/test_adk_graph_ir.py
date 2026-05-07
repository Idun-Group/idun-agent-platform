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


@pytest.mark.asyncio
async def test_adk_sequential_agent() -> None:
    config = ConfigBuilder.from_dict(_adk_config("mock_sequential_agent")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()
    seq_edges = sorted(
        [e for e in ir.edges if e.kind == EdgeKind.SEQUENTIAL_STEP],
        key=lambda e: e.order or 0,
    )
    assert [e.order for e in seq_edges] == [0, 1, 2]


@pytest.mark.asyncio
async def test_adk_parallel_agent() -> None:
    config = ConfigBuilder.from_dict(_adk_config("mock_parallel_agent")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()
    par_edges = [e for e in ir.edges if e.kind == EdgeKind.PARALLEL_BRANCH]
    assert len(par_edges) == 2


@pytest.mark.asyncio
async def test_adk_loop_agent_max_iterations() -> None:
    config = ConfigBuilder.from_dict(_adk_config("mock_loop_agent")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()
    root = next(n for n in ir.nodes if isinstance(n, AgentNode) and n.is_root)
    assert root.loop_max_iterations == 5
    assert any(e.kind == EdgeKind.LOOP_STEP for e in ir.edges)


@pytest.mark.asyncio
async def test_adk_nested_root_with_sequential_subagent() -> None:
    config = ConfigBuilder.from_dict(_adk_config("mock_nested_root")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    agent_nodes = [n for n in ir.nodes if isinstance(n, AgentNode)]
    # nested_root + inner_seq + inner_a + inner_b
    assert len(agent_nodes) == 4
    # Root → SequentialAgent uses PARENT_CHILD (root is LLM, not workflow)
    parent_edges = [e for e in ir.edges if e.kind == EdgeKind.PARENT_CHILD]
    assert len(parent_edges) == 1
    # Inner_seq → its 2 children use SEQUENTIAL_STEP
    seq_edges = [e for e in ir.edges if e.kind == EdgeKind.SEQUENTIAL_STEP]
    assert len(seq_edges) == 2


@pytest.mark.asyncio
async def test_adk_custom_baseagent_subclass_emits_warning() -> None:
    config = ConfigBuilder.from_dict(_adk_config("mock_custom_root")).build()
    agent = await ConfigBuilder.initialize_agent_from_config(config)
    ir = agent.get_graph_ir()

    root = next(n for n in ir.nodes if isinstance(n, AgentNode) and n.is_root)
    from idun_agent_schema.engine.graph import AgentKind

    assert root.agent_kind == AgentKind.CUSTOM
    assert any("custom_root" in w for w in ir.metadata.warnings)
