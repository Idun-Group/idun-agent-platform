"""Tests for LanggraphAgent graph introspection."""

from __future__ import annotations

from pathlib import Path

import pytest
from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import AgentGraph, AgentNode, EdgeKind

from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.asyncio
async def test_langgraph_get_graph_ir_simple() -> None:
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )
    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }
    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    ir = agent.get_graph_ir()

    assert isinstance(ir, AgentGraph)
    assert ir.metadata.framework == AgentFramework.LANGGRAPH
    assert ir.format_version == "1"
    assert any(isinstance(n, AgentNode) and n.is_root for n in ir.nodes)
    # Every edge has GRAPH_EDGE kind for LangGraph
    assert all(e.kind == EdgeKind.GRAPH_EDGE for e in ir.edges)


@pytest.mark.asyncio
async def test_langgraph_draw_mermaid_uses_native_output() -> None:
    """LangGraph delegates to native draw_mermaid; output should not contain
    our renderer's classDef definitions."""
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )
    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_agent",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
    }
    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    output = agent.draw_mermaid()
    assert "graph TD" in output or "%%{init" in output  # LangGraph native marker
    # Our renderer's classDef sentinels are NOT present
    assert "classDef agentRoot" not in output
