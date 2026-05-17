"use client";

/**
 * Renders a small icon + tooltip for one of the nine OpenInference span
 * kinds. Used by both the trace list view (a "kinds" summary cell) and
 * the trace detail tree (per-row icon).
 *
 * The set of kinds is locked to the design KB (decision: trace-feature
 * 08-05-2026 § "kinds"); unknown values fall back to a dashed circle so
 * the cell still renders rather than throwing.
 *
 * Two call shapes:
 *
 * - ``<SpanKindIcon kind="LLM" />`` — legacy / standalone use.
 * - ``<SpanKindIcon span={span} />`` — preferred for span rows.
 *   Routes through ``inferKind`` so ADK-instrumented spans (kind=
 *   ``INTERNAL``, no ``openinference.span.kind`` attribute) render
 *   the AGENT / TOOL / LLM icon inferred from the span name pattern,
 *   instead of the dashed-circle "Unknown" fallback.
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

import { inferKind } from "@/components/traces/_kind";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StandaloneSpanRead } from "@/lib/api/traces";

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
  /** Explicit kind string. Used when no full ``span`` is available. */
  kind?: string;
  /** Full span — preferred shape; routes through ``inferKind``. */
  span?: StandaloneSpanRead;
  size?: number;
  className?: string;
};

/**
 * Resolve the effective kind to render. ``span`` takes precedence
 * because ``inferKind`` already knows how to honour explicit OI kinds
 * AND fall through to name inference for ADK spans.
 */
function resolveKind(props: SpanKindIconProps): string | undefined {
  if (props.span) {
    return inferKind(props.span) ?? props.span.kind;
  }
  return props.kind;
}

export function SpanKindIcon(props: SpanKindIconProps) {
  const { size = 16, className } = props;
  const resolved = resolveKind(props);
  const meta = KIND_MAP[resolved?.toUpperCase() ?? ""] ?? FALLBACK;
  const { Icon, label } = meta;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={className}
            role="img"
            aria-label={label}
            data-kind={resolved}
          >
            <Icon size={size} aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
