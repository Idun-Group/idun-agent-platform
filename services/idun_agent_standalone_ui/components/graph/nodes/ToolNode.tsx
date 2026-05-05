"use client";

import { Handle, Position } from "@xyflow/react";
import { Plug, Sparkles, Wrench } from "lucide-react";

import type { ToolKind, ToolNode as ToolNodeData } from "@/lib/api/types/graph";
import { cn } from "@/lib/utils";

const ICON: Record<ToolKind, React.ReactNode> = {
  native: <Wrench size={12} />,
  mcp: <Plug size={12} />,
  built_in: <Sparkles size={12} />,
};

const ACCENT: Record<ToolKind, string> = {
  native: "border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  mcp: "border-sky-500/50 bg-sky-500/5 text-sky-700 dark:text-sky-300",
  built_in: "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-300",
};

interface ToolNodeProps {
  data: ToolNodeData;
  selected?: boolean;
  id: string;
}

export function ToolNode({ data, selected }: ToolNodeProps) {
  return (
    <div
      className={cn(
        "min-w-[140px] rounded-full border px-2.5 py-1 text-xs shadow-sm",
        ACCENT[data.tool_kind],
        selected && "ring-2 ring-accent",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-current opacity-40" />
      <div className="flex items-center gap-1.5">
        {ICON[data.tool_kind]}
        <span className="font-medium">{data.name}</span>
      </div>
      {data.mcp_server_name && (
        <div className="mt-0.5 truncate text-[10px] opacity-70">
          {data.mcp_server_name}
        </div>
      )}
    </div>
  );
}
