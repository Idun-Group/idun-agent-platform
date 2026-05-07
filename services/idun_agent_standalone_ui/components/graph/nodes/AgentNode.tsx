"use client";

import { Handle, Position } from "@xyflow/react";
import { Bot, Crown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AgentKind, AgentNode as AgentNodeData } from "@/lib/api/types/graph";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<AgentKind, string> = {
  llm: "LlmAgent",
  sequential: "SequentialAgent",
  parallel: "ParallelAgent",
  loop: "LoopAgent",
  custom: "Custom",
};

interface AgentNodeProps {
  data: AgentNodeData;
  selected?: boolean;
  id: string;
}

export function AgentNode({ data, selected }: AgentNodeProps) {
  return (
    <div
      className={cn(
        "min-w-[200px] rounded-lg border bg-card px-3 py-2 shadow-sm",
        data.is_root
          ? "border-accent/60 bg-accent/5"
          : "border-border",
        selected && "ring-2 ring-accent",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-accent/40" />
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-accent">
          {data.is_root ? <Crown size={16} /> : <Bot size={16} />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold leading-tight text-foreground">
            {data.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {KIND_LABEL[data.agent_kind]}
            </Badge>
            {data.is_root && (
              <Badge variant="outline" className="text-[10px]">
                root
              </Badge>
            )}
            {data.model && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {data.model}
              </Badge>
            )}
            {data.loop_max_iterations != null && (
              <Badge variant="outline" className="text-[10px]">
                ×{data.loop_max_iterations}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-accent/40" />
    </div>
  );
}
