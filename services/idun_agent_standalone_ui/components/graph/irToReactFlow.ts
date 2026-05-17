import type { Edge, Node } from "@xyflow/react";

import type {
  AgentGraph,
  AgentGraphEdge,
  AgentGraphNode,
} from "@/lib/api/types/graph";

export interface ReactFlowGraph {
  nodes: Node<AgentGraphNode>[];
  edges: Edge<AgentGraphEdge>[];
}

export function irToReactFlow(graph: AgentGraph): ReactFlowGraph {
  const nodes: Node<AgentGraphNode>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.kind, // "agent" | "tool"
    position: { x: 0, y: 0 }, // dagre layout fills these later
    data: n,
  }));

  const edges: Edge<AgentGraphEdge>[] = graph.edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    type: "pretty", // single custom edge component dispatches on data.kind
    data: e,
  }));

  return { nodes, edges };
}
