"""Render an AgentGraph IR as ASCII art (tree printer).

Framework-agnostic. LangGraph adapters override draw_ascii() to use
LangGraph's native draw_ascii() (which uses grandalf).
"""

from __future__ import annotations

from collections import defaultdict

from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentNode,
    EdgeKind,
    ToolNode,
)


def _agent_label(node: AgentNode) -> str:
    kind_name = {
        "llm": "LlmAgent",
        "sequential": "SequentialAgent",
        "parallel": "ParallelAgent",
        "loop": "LoopAgent",
        "custom": "Custom",
    }[node.agent_kind.value]
    suffix = ", root" if node.is_root else ""
    return f"{node.name} ({kind_name}{suffix})"


def _tool_label(node: ToolNode) -> str:
    if node.tool_kind.value == "mcp":
        server = f": {node.mcp_server_name}" if node.mcp_server_name else ""
        return f"{node.name} (mcp{server})"
    return f"{node.name} ({node.tool_kind.value})"


def render_ascii(graph: AgentGraph) -> str:
    nodes_by_id = {n.id: n for n in graph.nodes}

    sub_agents: dict[str, list[str]] = defaultdict(list)
    tools: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        if edge.kind == EdgeKind.TOOL_ATTACH:
            tools[edge.source].append(edge.target)
        elif edge.kind in {
            EdgeKind.PARENT_CHILD,
            EdgeKind.SEQUENTIAL_STEP,
            EdgeKind.PARALLEL_BRANCH,
            EdgeKind.LOOP_STEP,
            # GRAPH_EDGE: LangGraph delegates to native draw_ascii; if a GRAPH_EDGE
            # ever shows up here, treat it as parent_child for tree-printing purposes.
            EdgeKind.GRAPH_EDGE,
        }:
            sub_agents[edge.source].append(edge.target)

    lines: list[str] = []
    lines.append(f"{graph.metadata.framework.value} · {graph.metadata.agent_name}")
    for w in graph.metadata.warnings:
        lines.append(f"⚠ {w}")

    # Cycle guard — LangGraph IRs can have cycles (conditional edges that loop
    # back). Without this, _walk recurses until the stack blows up.
    visited: set[str] = set()

    def _walk(node_id: str, prefix: str, is_last: bool, is_root: bool) -> None:
        node = nodes_by_id[node_id]
        connector = "" if is_root else ("└─ " if is_last else "├─ ")
        if isinstance(node, AgentNode):
            if node_id in visited:
                lines.append(f"{prefix}{connector}{_agent_label(node)} ↺")
                return
            visited.add(node_id)
            lines.append(f"{prefix}{connector}{_agent_label(node)}")
        else:
            assert isinstance(node, ToolNode)
            lines.append(f"{prefix}{connector}{_tool_label(node)}")
            return  # tools are leaves

        child_prefix = prefix + ("" if is_root else ("   " if is_last else "│  "))

        node_tools = tools.get(node_id, [])
        node_subs = sub_agents.get(node_id, [])

        if node_tools:
            tools_is_last = not node_subs
            tools_connector = "└─ " if tools_is_last else "├─ "
            lines.append(f"{child_prefix}{tools_connector}tools")
            tool_prefix = child_prefix + ("   " if tools_is_last else "│  ")
            for i, tid in enumerate(node_tools):
                _walk(tid, tool_prefix, i == len(node_tools) - 1, is_root=False)

        for i, sid in enumerate(node_subs):
            _walk(sid, child_prefix, i == len(node_subs) - 1, is_root=False)

    _walk(graph.metadata.root_id, "", True, is_root=True)
    return "\n".join(lines)
