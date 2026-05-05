"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

import type { AgentGraphEdge, EdgeKind } from "@/lib/api/types/graph";

interface StylePreset {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

const STYLES: Record<EdgeKind, StylePreset> = {
  parent_child: { stroke: "var(--accent, #7a6cf0)", strokeWidth: 1.5 },
  sequential_step: { stroke: "var(--accent, #7a6cf0)", strokeWidth: 1.5 },
  parallel_branch: { stroke: "var(--accent, #7a6cf0)", strokeWidth: 2 },
  loop_step: {
    stroke: "var(--accent, #7a6cf0)",
    strokeWidth: 1.5,
    strokeDasharray: "5 4",
  },
  tool_attach: {
    stroke: "currentColor",
    strokeWidth: 1.2,
    strokeDasharray: "4 3",
  },
  graph_edge: { stroke: "var(--accent, #7a6cf0)", strokeWidth: 1.2 },
};

function edgeLabel(data: AgentGraphEdge | undefined): string | null {
  if (!data) return null;
  if (data.kind === "sequential_step" && data.order != null) {
    return `${data.order + 1}.`;
  }
  if (data.kind === "loop_step") {
    return data.label ?? "↻";
  }
  if (data.kind === "graph_edge" && data.condition) {
    return data.condition;
  }
  return data.label ?? null;
}

// Define props via plain interface — @xyflow/react's EdgeProps generic
// constrains payload types in ways our union doesn't satisfy.
interface PrettyEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: import("@xyflow/react").Position;
  targetPosition: import("@xyflow/react").Position;
  data?: AgentGraphEdge;
}

export function PrettyEdge(props: PrettyEdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  } = props;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const style = data ? STYLES[data.kind] : STYLES.parent_child;
  const label = edgeLabel(data);

  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="pointer-events-none rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
