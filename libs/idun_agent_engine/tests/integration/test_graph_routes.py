"""Integration tests for /agent/graph, /agent/graph/mermaid, /agent/graph/ascii.

Boots the engine in-process via FastAPI's TestClient against a set of
real-world agent topologies (LangGraph + ADK). Validates that all three
routes return 200 and the IR's structure matches expectations per topology.

Caught two production bugs during development:
- `lg_branching` triggered a recursion bomb in `render_ascii` for cyclic
  IRs (LangGraph conditional edges). Fix: visited-set guard.
- `__end__` rendered as a "ghost" Custom agent card in LangGraph IRs.
  Fix: skip the sentinel in the LangGraph adapter walker.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.config_builder import ConfigBuilder

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "agents"


@dataclass(frozen=True)
class Topology:
    """Expected shape of a graph IR for a given fixture."""

    name: str
    framework: str  # "LANGGRAPH" | "ADK"
    fixture_file: str
    var_name: str
    expected_agent_count: int
    expected_tool_count: int
    expected_edge_count: int
    # Subset assertions: edges/agents/tools must include AT LEAST these.
    expected_edge_kinds: frozenset[str]
    expected_agent_kinds: frozenset[str]
    expected_tool_kinds: frozenset[str] = frozenset()


TOPOLOGIES: list[Topology] = [
    Topology(
        name="lg_chat",
        framework="LANGGRAPH",
        fixture_file="topology_lg_chat.py",
        var_name="graph",
        # __start__ + echo (no __end__ — it's filtered)
        expected_agent_count=2,
        expected_tool_count=0,
        expected_edge_count=1,
        expected_edge_kinds=frozenset({"graph_edge"}),
        expected_agent_kinds=frozenset({"custom"}),
    ),
    Topology(
        name="lg_branching",
        framework="LANGGRAPH",
        fixture_file="topology_lg_branching.py",
        var_name="graph",
        # __start__ + retrieve + grade_documents + generate + transform_query
        # (__end__ is filtered)
        expected_agent_count=5,
        expected_tool_count=0,
        # __start__→retrieve, retrieve→grade_documents, 2× from grade_documents
        # (transform_query, generate), transform_query→retrieve (cycle),
        # generate→transform_query (cycle). generate→__end__ filtered.
        expected_edge_count=6,
        expected_edge_kinds=frozenset({"graph_edge"}),
        expected_agent_kinds=frozenset({"custom"}),
    ),
    Topology(
        name="adk_simple",
        framework="ADK",
        fixture_file="topology_adk_simple.py",
        var_name="root_agent",
        expected_agent_count=1,
        expected_tool_count=0,
        expected_edge_count=0,
        expected_edge_kinds=frozenset(),
        expected_agent_kinds=frozenset({"llm"}),
    ),
    Topology(
        name="adk_with_tools",
        framework="ADK",
        fixture_file="topology_adk_with_tools.py",
        var_name="root_agent",
        expected_agent_count=1,
        expected_tool_count=3,  # 2 native + 1 built_in
        expected_edge_count=3,
        expected_edge_kinds=frozenset({"tool_attach"}),
        expected_agent_kinds=frozenset({"llm"}),
        expected_tool_kinds=frozenset({"native", "built_in"}),
    ),
    Topology(
        name="adk_sequential",
        framework="ADK",
        fixture_file="topology_adk_sequential.py",
        var_name="root_agent",
        expected_agent_count=4,  # root + 3 steps
        expected_tool_count=0,
        expected_edge_count=3,
        expected_edge_kinds=frozenset({"sequential_step"}),
        expected_agent_kinds=frozenset({"llm", "sequential"}),
    ),
    Topology(
        name="adk_parallel",
        framework="ADK",
        fixture_file="topology_adk_parallel.py",
        var_name="root_agent",
        expected_agent_count=4,  # root + 3 branches
        expected_tool_count=0,
        expected_edge_count=3,
        expected_edge_kinds=frozenset({"parallel_branch"}),
        expected_agent_kinds=frozenset({"llm", "parallel"}),
    ),
    Topology(
        name="adk_loop",
        framework="ADK",
        fixture_file="topology_adk_loop.py",
        var_name="root_agent",
        expected_agent_count=3,  # root + critic + reviser
        expected_tool_count=0,
        expected_edge_count=2,
        expected_edge_kinds=frozenset({"loop_step"}),
        expected_agent_kinds=frozenset({"llm", "loop"}),
    ),
    Topology(
        name="adk_nested",
        framework="ADK",
        fixture_file="topology_adk_nested.py",
        var_name="root_agent",
        expected_agent_count=3,  # coordinator + billing + tech_support
        expected_tool_count=4,  # search_faq + refund + create_ticket + google_search
        expected_edge_count=6,  # 2 parent_child + 4 tool_attach
        expected_edge_kinds=frozenset({"parent_child", "tool_attach"}),
        expected_agent_kinds=frozenset({"llm"}),
        expected_tool_kinds=frozenset({"native", "built_in"}),
    ),
]


def _build_app(topology: Topology):
    abs_path = FIXTURES / topology.fixture_file
    if topology.framework == "LANGGRAPH":
        agent_cfg = {
            "type": "LANGGRAPH",
            "config": {
                "name": topology.name,
                "graph_definition": f"{abs_path}:{topology.var_name}",
            },
        }
    else:  # ADK
        agent_cfg = {
            "type": "ADK",
            "config": {
                "name": topology.name,
                "app_name": topology.name,
                "agent": f"{abs_path}:{topology.var_name}",
            },
        }
    cfg = ConfigBuilder.from_dict(
        {"server": {"api": {"port": 0}}, "agent": agent_cfg}
    ).build()
    return create_app(engine_config=cfg)


@pytest.mark.integration
@pytest.mark.parametrize("topology", TOPOLOGIES, ids=lambda t: t.name)
class TestGraphRoutesAcrossTopologies:
    """Smoke-test the three graph routes against each topology."""

    def test_ir_route_returns_expected_structure(self, topology: Topology):
        app = _build_app(topology)
        with TestClient(app) as client:
            r = client.get("/agent/graph")
        assert r.status_code == 200, r.text

        ir = r.json()
        assert ir["format_version"] == "1"
        assert ir["metadata"]["framework"] == topology.framework

        agents = [n for n in ir["nodes"] if n["kind"] == "agent"]
        tools = [n for n in ir["nodes"] if n["kind"] == "tool"]
        assert len(agents) == topology.expected_agent_count, (
            f"agents: got {len(agents)}, want {topology.expected_agent_count}"
        )
        assert len(tools) == topology.expected_tool_count, (
            f"tools: got {len(tools)}, want {topology.expected_tool_count}"
        )
        assert len(ir["edges"]) == topology.expected_edge_count, (
            f"edges: got {len(ir['edges'])}, want {topology.expected_edge_count}"
        )

        # Subset checks — IR may have edge/agent/tool kinds beyond the expected
        # set, but it must include all expected kinds.
        edge_kinds = {e["kind"] for e in ir["edges"]}
        assert topology.expected_edge_kinds <= edge_kinds, (
            f"edge_kinds missing: {topology.expected_edge_kinds - edge_kinds}"
        )
        agent_kinds = {a["agent_kind"] for a in agents}
        assert topology.expected_agent_kinds <= agent_kinds, (
            f"agent_kinds missing: {topology.expected_agent_kinds - agent_kinds}"
        )
        if topology.expected_tool_kinds:
            tool_kinds = {t["tool_kind"] for t in tools}
            assert topology.expected_tool_kinds <= tool_kinds, (
                f"tool_kinds missing: "
                f"{topology.expected_tool_kinds - tool_kinds}"
            )

    def test_mermaid_route_returns_non_empty_string(self, topology: Topology):
        app = _build_app(topology)
        with TestClient(app) as client:
            r = client.get("/agent/graph/mermaid")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "mermaid" in body
        assert isinstance(body["mermaid"], str) and body["mermaid"].strip()
        # Either our framework-agnostic header or LangGraph's native init marker
        assert "graph TD" in body["mermaid"] or "%%{init" in body["mermaid"]

    def test_ascii_route_returns_non_empty_string(self, topology: Topology):
        """Also exercises the cycle guard for LangGraph's branching graph."""
        app = _build_app(topology)
        with TestClient(app) as client:
            r = client.get("/agent/graph/ascii")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "ascii" in body
        assert isinstance(body["ascii"], str) and body["ascii"].strip()


@pytest.mark.integration
class TestGraphRoutesRegression:
    """Targeted tests for bugs found during heavy E2E smoke testing."""

    def test_ascii_handles_cyclic_langgraph_without_recursion(self):
        """Regression: render_ascii recursed forever on graphs with cycles.

        The Self-RAG-style fixture creates a cycle (transform_query → retrieve
        and generate → transform_query). Before the visited-set guard, this
        crashed with RecursionError → 500.
        """
        topology = next(t for t in TOPOLOGIES if t.name == "lg_branching")
        app = _build_app(topology)
        with TestClient(app) as client:
            r = client.get("/agent/graph/ascii")
        assert r.status_code == 200
        # The ↺ marker is emitted on revisit — proves the guard fired.
        assert "↺" in r.json()["ascii"]

    def test_langgraph_ir_filters_end_sentinel(self):
        """Regression: __end__ rendered as a Custom agent card on the canvas.

        The LangGraph adapter walks `lg_graph.nodes` directly; without
        filtering, __end__ shows up as a non-root Custom agent.
        """
        topology = next(t for t in TOPOLOGIES if t.name == "lg_chat")
        app = _build_app(topology)
        with TestClient(app) as client:
            r = client.get("/agent/graph")
        assert r.status_code == 200
        ir = r.json()
        node_names = {n["name"] for n in ir["nodes"]}
        assert "__end__" not in node_names
        # __start__ is kept as the entry-point marker (is_root=True).
        assert "__start__" in node_names
