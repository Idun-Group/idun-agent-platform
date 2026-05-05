"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  getNodesBounds,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

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

export interface AgentGraphHandle {
  /** The .react-flow root DOM element (for html-to-image), or null pre-mount. */
  getCanvasElement(): HTMLElement | null;
  /** World-coordinate bounding box of all nodes; null if no nodes. */
  getNodesBounds(): { x: number; y: number; width: number; height: number } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES = { agent: AgentNode, tool: ToolNode } as Record<string, React.ComponentType<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EDGE_TYPES = { pretty: PrettyEdge } as Record<string, React.ComponentType<any>>;

export const AgentGraph = forwardRef<AgentGraphHandle, AgentGraphProps>(
  function AgentGraph({ graph, height = 420 }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const { nodes, edges } = useMemo(() => {
      const mapped = irToReactFlow(graph);
      return {
        nodes: applyDagreLayout(mapped.nodes, mapped.edges),
        edges: mapped.edges,
      };
    }, [graph]);

    useImperativeHandle(
      ref,
      () => ({
        getCanvasElement(): HTMLElement | null {
          // Capture the viewport (not the outer .react-flow wrapper) so html-to-image
          // gets the nodes/edges layer; our transform override will reset its own
          // pan/zoom transform (otherwise it composes with the user's current viewport
          // and the export reflects whatever pan/zoom they have).
          return containerRef.current?.querySelector<HTMLElement>(".react-flow__viewport") ?? null;
        },
        getNodesBounds() {
          if (nodes.length === 0) return null;
          const b = getNodesBounds(nodes);
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        },
      }),
      [nodes],
    );

    return (
      <div
        ref={containerRef}
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
  },
);
