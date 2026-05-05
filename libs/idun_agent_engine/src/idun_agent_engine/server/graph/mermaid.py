"""Render an AgentGraph IR as a Mermaid source string.

Framework-agnostic — consumes only the IR. LangGraph adapters override
draw_mermaid() to use LangGraph's native renderer; ADK uses this.
"""

from __future__ import annotations

from idun_agent_schema.engine.graph import (
    AgentGraph,
    AgentGraphEdge,
    AgentGraphNode,
    AgentNode,
    EdgeKind,
    ToolKind,
    ToolNode,
)


def _node_id(node_id: str) -> str:
    """Mermaid identifiers can't contain ':' or '@' — convert to underscores."""
    return node_id.replace(":", "_").replace("@", "_")


def _node_class(node: AgentGraphNode) -> str:
    if isinstance(node, AgentNode):
        return "agentRoot" if node.is_root else "agent"
    assert isinstance(node, ToolNode)
    return {
        ToolKind.MCP: "toolMcp",
        ToolKind.NATIVE: "toolNative",
        ToolKind.BUILT_IN: "toolBuiltIn",
    }[node.tool_kind]


def _node_line(node: AgentGraphNode) -> str:
    nid = _node_id(node.id)
    cls = _node_class(node)
    if isinstance(node, AgentNode):
        label = f"{node.name}<br/>{node.agent_kind.value}"
        return f'  {nid}["{label}"]:::{cls}'
    assert isinstance(node, ToolNode)
    return f'  {nid}(["{node.name}"]):::{cls}'


def _edge_line(
    edge: AgentGraphEdge,
    node_lookup: dict[str, AgentGraphNode],
) -> str:
    src = _node_id(edge.source)
    dst = _node_id(edge.target)

    if edge.kind == EdgeKind.PARENT_CHILD:
        return f"  {src} --> {dst}"
    if edge.kind == EdgeKind.TOOL_ATTACH:
        return f"  {src} -.-> {dst}"
    if edge.kind == EdgeKind.SEQUENTIAL_STEP:
        order = (edge.order or 0) + 1
        return f'  {src} == "{order}." ==> {dst}'
    if edge.kind == EdgeKind.PARALLEL_BRANCH:
        return f"  {src} ==> {dst}"
    if edge.kind == EdgeKind.LOOP_STEP:
        parent = node_lookup.get(edge.source)
        max_iter = getattr(parent, "loop_max_iterations", None)
        label = f"↻ ×{max_iter}" if max_iter else "↻"
        return f'  {src} -. "{label}" .-> {dst}'
    if edge.kind == EdgeKind.GRAPH_EDGE:
        if edge.condition:
            return f'  {src} -- "{edge.condition}" --> {dst}'
        return f"  {src} --> {dst}"
    raise ValueError(f"Unknown edge kind: {edge.kind}")


_CLASS_DEFS = [
    "  classDef agentRoot fill:#f3efff,stroke:#7a6cf0,stroke-width:1.5px",
    "  classDef agent fill:#fff,stroke:#cfcfd6",
    "  classDef toolMcp fill:#eaf3ff,stroke:#5a8de6",
    "  classDef toolNative fill:#f4faf2,stroke:#7cae5d",
    "  classDef toolBuiltIn fill:#fff7e6,stroke:#d99b3a",
]


def render_mermaid(graph: AgentGraph) -> str:
    lookup: dict[str, AgentGraphNode] = {n.id: n for n in graph.nodes}
    lines = ["graph TD"]
    lines.extend(_node_line(n) for n in graph.nodes)
    lines.extend(_edge_line(e, lookup) for e in graph.edges)
    lines.extend(_CLASS_DEFS)
    return "\n".join(lines)
