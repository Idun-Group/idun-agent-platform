"""Golden tests for render_ascii (framework-agnostic)."""

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

from idun_agent_engine.server.graph.ascii import render_ascii

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.unit
def test_render_ascii_matches_golden() -> None:
    graph = AgentGraph(
        metadata=AgentGraphMetadata(
            framework=AgentFramework.ADK,
            agent_name="root",
            root_id="agent:root",
        ),
        nodes=[
            AgentNode(
                id="agent:root", name="root", agent_kind=AgentKind.LLM, is_root=True
            ),
            ToolNode(
                id="tool:search@root",
                name="search",
                tool_kind=ToolKind.MCP,
                mcp_server_name="stdio: npx server-filesystem",
            ),
            AgentNode(id="agent:child", name="child", agent_kind=AgentKind.LLM),
            ToolNode(id="tool:fetch@child", name="fetch", tool_kind=ToolKind.NATIVE),
        ],
        edges=[
            AgentGraphEdge(
                source="agent:root",
                target="tool:search@root",
                kind=EdgeKind.TOOL_ATTACH,
            ),
            AgentGraphEdge(
                source="agent:root", target="agent:child", kind=EdgeKind.PARENT_CHILD
            ),
            AgentGraphEdge(
                source="agent:child",
                target="tool:fetch@child",
                kind=EdgeKind.TOOL_ATTACH,
            ),
        ],
    )
    output = render_ascii(graph)
    expected = (FIXTURES / "simple.ascii").read_text()
    assert output.rstrip() == expected.rstrip()
