"""Tests for the graph IR Pydantic models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from idun_agent_schema.engine.agent_framework import AgentFramework
from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentGraphEdge,
    AgentGraphMetadata,
    AgentKind,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)


def _sample_graph() -> AgentGraph:
    return AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name="root",
            root_id="agent:root",
            warnings=[],
        ),
        nodes=[
            AgentNode(
                id="agent:root",
                name="root",
                agent_kind=AgentKind.LLM,
                is_root=True,
                model="gemini-2.5-flash",
            ),
            ToolNode(
                id="tool:search@root",
                name="search",
                tool_kind=ToolKind.MCP,
                mcp_server_name="stdio: npx server-filesystem",
            ),
        ],
        edges=[
            AgentGraphEdge(
                source="agent:root",
                target="tool:search@root",
                kind=EdgeKind.TOOL_ATTACH,
            ),
        ],
    )


def test_agent_graph_round_trips_through_json() -> None:
    graph = _sample_graph()
    raw = graph.model_dump_json()
    parsed = AgentGraph.model_validate_json(raw)
    assert parsed == graph


def test_node_discriminator_parses_both_variants() -> None:
    payload = {
        "format_version": "1",
        "metadata": {
            "framework": "ADK",
            "agent_name": "root",
            "root_id": "agent:root",
            "warnings": [],
        },
        "nodes": [
            {
                "kind": "agent",
                "id": "agent:root",
                "name": "root",
                "agent_kind": "llm",
                "is_root": True,
            },
            {"kind": "tool", "id": "tool:t@root", "name": "t", "tool_kind": "native"},
        ],
        "edges": [
            {"source": "agent:root", "target": "tool:t@root", "kind": "tool_attach"},
        ],
    }
    parsed = AgentGraph.model_validate(payload)
    assert isinstance(parsed.nodes[0], AgentNode)
    assert isinstance(parsed.nodes[1], ToolNode)


def test_format_version_rejects_unknown() -> None:
    payload = {
        "format_version": "2",
        "metadata": {
            "framework": "ADK",
            "agent_name": "n",
            "root_id": "agent:r",
            "warnings": [],
        },
        "nodes": [],
        "edges": [],
    }
    with pytest.raises(ValidationError):
        AgentGraph.model_validate(payload)


def test_format_version_defaults_to_1() -> None:
    g = AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.LANGGRAPH,
            agent_name="n",
            root_id="r",
        ),
        nodes=[],
        edges=[],
    )
    assert g.format_version == "1"
