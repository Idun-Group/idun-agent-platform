"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useMemo } from "react";

import type { AgentGraph as AgentGraphIR } from "@/lib/api/types/graph";

import { PrettyEdge } from "./edges/PrettyEdge";
import { irToReactFlow } from "./irToReactFlow";
import { applyDagreLayout } from "./layout";
import { AgentNode } from "./nodes/AgentNode";
import { ToolNode } from "./nodes/ToolNode";

interface AgentGraphProps {
  graph: AgentGraphIR;
  /** Height of the canvas. Defaults to a sensible value for a card embed. */
  height?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES = { agent: AgentNode, tool: ToolNode } as Record<string, React.ComponentType<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EDGE_TYPES = { pretty: PrettyEdge } as Record<string, React.ComponentType<any>>;

export function AgentGraph({ graph, height = 420 }: AgentGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const mapped = irToReactFlow(graph);
    return {
      nodes: applyDagreLayout(mapped.nodes, mapped.edges),
      edges: mapped.edges,
    };
  }, [graph]);

  return (
    <div
      style={{ height }}
      className="w-full overflow-hidden rounded-md border bg-background"
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          minZoom={0.4}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
