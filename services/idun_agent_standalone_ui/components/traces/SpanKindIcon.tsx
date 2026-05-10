"use client";

/**
 * Renders a small icon + tooltip for one of the nine OpenInference span
 * kinds. Used by both the trace list view (a "kinds" summary cell) and
 * the trace detail tree (per-row icon).
 *
 * The set of kinds is locked to the design KB (decision: trace-feature
 * 08-05-2026 § "kinds"); unknown values fall back to a dashed circle so
 * the cell still renders rather than throwing.
 */

import {
  ArrowUpDown,
  Bot,
  Boxes,
  CircleDashed,
  Database,
  Gauge,
  Link as LinkIcon,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type KindMeta = {
  Icon: LucideIcon;
  label: string;
};

const KIND_MAP: Record<string, KindMeta> = {
  LLM: { Icon: Sparkles, label: "LLM call" },
  EMBEDDING: { Icon: Boxes, label: "Embedding generation" },
  CHAIN: { Icon: LinkIcon, label: "Chain step" },
  RETRIEVER: { Icon: Database, label: "Retriever (vector / search)" },
  RERANKER: {
    Icon: ArrowUpDown,
    label: "Reranker (re-ordering retrieved docs)",
  },
  TOOL: { Icon: Wrench, label: "Tool / function call" },
  AGENT: { Icon: Bot, label: "Agent decision step" },
  GUARDRAIL: { Icon: ShieldCheck, label: "Guardrail check" },
  EVALUATOR: { Icon: Gauge, label: "Evaluator scoring" },
};

const FALLBACK: KindMeta = { Icon: CircleDashed, label: "Unknown span kind" };

export type SpanKindIconProps = {
  kind: string;
  size?: number;
  className?: string;
};

export function SpanKindIcon({ kind, size = 16, className }: SpanKindIconProps) {
  const meta = KIND_MAP[kind?.toUpperCase()] ?? FALLBACK;
  const { Icon, label } = meta;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={className}
            role="img"
            aria-label={label}
            data-kind={kind}
          >
            <Icon size={size} aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
