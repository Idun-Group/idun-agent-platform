"""Golden tests for render_mermaid (framework-agnostic)."""

from __future__ import annotations

from pathlib import Path

import pytest
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

from idun_agent_engine.server.graph.mermaid import render_mermaid

FIXTURES = Path(__file__).parent / "fixtures"


def _build_simple_graph() -> AgentGraph:
    """root LlmAgent with one MCP tool and one native tool, no sub-agents."""
    return AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name="root",
            root_id="agent:root",
        ),
        nodes=[
            AgentNode(
                id="agent:root", name="root", agent_kind=AgentKind.LLM, is_root=True
            ),
            ToolNode(id="tool:search@root", name="search", tool_kind=ToolKind.MCP),
            ToolNode(id="tool:lookup@root", name="lookup", tool_kind=ToolKind.NATIVE),
        ],
        edges=[
            AgentGraphEdge(
                source="agent:root",
                target="tool:search@root",
                kind=EdgeKind.TOOL_ATTACH,
            ),
            AgentGraphEdge(
                source="agent:root",
                target="tool:lookup@root",
                kind=EdgeKind.TOOL_ATTACH,
            ),
        ],
    )


@pytest.mark.unit
def test_render_mermaid_matches_golden() -> None:
    output = render_mermaid(_build_simple_graph())
    expected = (FIXTURES / "simple.mermaid").read_text()
    assert output.strip() == expected.strip()


@pytest.mark.unit
def test_render_mermaid_handles_workflow_edges() -> None:
    graph = AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name="root",
            root_id="agent:root",
        ),
        nodes=[
            AgentNode(
                id="agent:root",
                name="root",
                agent_kind=AgentKind.SEQUENTIAL,
                is_root=True,
            ),
            AgentNode(id="agent:a", name="a", agent_kind=AgentKind.LLM),
            AgentNode(id="agent:b", name="b", agent_kind=AgentKind.LLM),
        ],
        edges=[
            AgentGraphEdge(
                source="agent:root",
                target="agent:a",
                kind=EdgeKind.SEQUENTIAL_STEP,
                order=0,
            ),
            AgentGraphEdge(
                source="agent:root",
                target="agent:b",
                kind=EdgeKind.SEQUENTIAL_STEP,
                order=1,
            ),
        ],
    )
    out = render_mermaid(graph)
    assert "graph TD" in out
    # Order labels should appear (1-indexed in display)
    assert "1." in out and "2." in out
