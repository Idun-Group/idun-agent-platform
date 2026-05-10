"use client";

/**
 * Time-axis waterfall for a trace's spans.
 *
 * Hand-rolled ~120 LOC per the locked stack decision (`tasks/
 * trace-feature-08-05-2026/11-frontend-tree-libs.md` § 5a "Hand-roll with
 * CSS"). Each span is a positioned bar inside a relatively-positioned
 * track; `marginLeft` and `width` are computed as percentages of the
 * trace's total duration so the layout is responsive without any JS
 * resize observers.
 *
 * Critical-path emphasis: at each depth, the span with the longest
 * duration gets a thicker accent border. Pattern #4 from `12-oss-trace-
 * uis-comparison.md` ("Grafana Tempo CRISP — adopt"). Cheap to compute
 * (single grouping pass), large debug value when chasing latency.
 *
 * Selection model is shared with `TraceTree`: the parent route owns
 * `selectedSpanId` and `onSelect`, so clicking a bar here highlights
 * the same row in the tree and feeds the `SpanDetailRail`.
 */

import * as React from "react";

import { SpanKindIcon } from "@/components/traces/SpanKindIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StandaloneSpanRead, StandaloneSpanTreeNode } from "@/lib/api/traces";
import { cn } from "@/lib/utils";

/**
 * Tailwind palette per OpenInference span kind. We intentionally use
 * arbitrary low-opacity backgrounds so the bars are visible against
 * both light and dark theme variables. (Tailwind v4's CSS variables
 * make `bg-blue-500/30` resolve correctly under either palette.)
 */
const KIND_BAR_CLASS: Record<string, string> = {
  LLM: "bg-blue-500/30 border-blue-500",
  EMBEDDING: "bg-purple-500/30 border-purple-500",
  CHAIN: "bg-gray-500/30 border-gray-500",
  RETRIEVER: "bg-green-500/30 border-green-500",
  RERANKER: "bg-teal-500/30 border-teal-500",
  TOOL: "bg-yellow-500/30 border-yellow-500",
  AGENT: "bg-pink-500/30 border-pink-500",
  GUARDRAIL: "bg-red-500/30 border-red-500",
  EVALUATOR: "bg-orange-500/30 border-orange-500",
};

const FALLBACK_BAR_CLASS = "bg-muted/40 border-muted-foreground/40";

type FlatSpan = {
  span: StandaloneSpanRead;
  depth: number;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
};

export type WaterfallProps = {
  nodes: StandaloneSpanTreeNode[];
  selectedSpanId: string | null;
  onSelect: (span: StandaloneSpanRead) => void;
  className?: string;
};

/** Walk the tree depth-first into a flat list, parsing timestamps once. */
function flattenForWaterfall(nodes: StandaloneSpanTreeNode[]): FlatSpan[] {
  const out: FlatSpan[] = [];
  function visit(node: StandaloneSpanTreeNode, depth: number): void {
    const startedAtMs = Date.parse(node.span.startedAt);
    // Fall back to startedAt + latencyMs when the span has no end timestamp
    // (still-running edge case). Final fallback: min duration of 1ms so the
    // bar is visible.
    const endedAtMs = node.span.endedAt
      ? Date.parse(node.span.endedAt)
      : startedAtMs + (node.span.latencyMs ?? 1);
    const durationMs = Math.max(0, endedAtMs - startedAtMs);
    out.push({ span: node.span, depth, startedAtMs, endedAtMs, durationMs });
    for (const child of node.children) visit(child, depth + 1);
  }
  for (const n of nodes) visit(n, 0);
  return out;
}

/**
 * Compute the set of span ids on the critical path: the longest-
 * duration span at each depth. Stored as a Set for O(1) lookup at
 * render time. Memoised at the trace level — recomputing per row
 * would be quadratic.
 */
function criticalPathIds(spans: FlatSpan[]): Set<string> {
  const longestPerDepth = new Map<number, FlatSpan>();
  for (const s of spans) {
    const current = longestPerDepth.get(s.depth);
    if (!current || s.durationMs > current.durationMs) {
      longestPerDepth.set(s.depth, s);
    }
  }
  const out = new Set<string>();
  for (const s of longestPerDepth.values()) out.add(s.span.otelSpanId);
  return out;
}

export function Waterfall({
  nodes,
  selectedSpanId,
  onSelect,
  className,
}: WaterfallProps) {
  const flatSpans = React.useMemo(() => flattenForWaterfall(nodes), [nodes]);

  // Trace bounds. Empty tree → render an empty container rather than
  // dividing by zero.
  const bounds = React.useMemo(() => {
    if (flatSpans.length === 0) return null;
    let traceStartMs = Number.POSITIVE_INFINITY;
    let traceEndMs = Number.NEGATIVE_INFINITY;
    for (const s of flatSpans) {
      if (s.startedAtMs < traceStartMs) traceStartMs = s.startedAtMs;
      if (s.endedAtMs > traceEndMs) traceEndMs = s.endedAtMs;
    }
    const total = Math.max(1, traceEndMs - traceStartMs);
    return { traceStartMs, traceEndMs, total };
  }, [flatSpans]);

  const critical = React.useMemo(
    () => criticalPathIds(flatSpans),
    [flatSpans],
  );

  if (!bounds || flatSpans.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-6 text-xs text-muted-foreground",
          className,
        )}
      >
        No spans to plot.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        role="list"
        aria-label="Span waterfall"
        className={cn("flex flex-col gap-1 text-xs", className)}
      >
        {flatSpans.map((row) => {
          const leftPct =
            ((row.startedAtMs - bounds.traceStartMs) / bounds.total) * 100;
          const widthPct = (row.durationMs / bounds.total) * 100;
          const isSelected = row.span.otelSpanId === selectedSpanId;
          const isCritical = critical.has(row.span.otelSpanId);
          const kindClass =
            KIND_BAR_CLASS[row.span.kind?.toUpperCase()] ?? FALLBACK_BAR_CLASS;

          return (
            <div
              key={row.span.otelSpanId}
              role="listitem"
              data-span-id={row.span.otelSpanId}
              data-critical={isCritical || undefined}
              data-selected={isSelected || undefined}
              className={cn(
                "group/wf-row grid cursor-pointer grid-cols-[200px_1fr] items-center gap-3 rounded-md px-2 py-1 hover:bg-muted/50",
                isSelected && "bg-muted",
              )}
              onClick={() => onSelect(row.span)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <SpanKindIcon kind={row.span.kind} size={14} />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
                  title={row.span.name}
                >
                  {row.span.name}
                </span>
              </div>
              <div className="relative h-5 w-full rounded bg-muted/30">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      data-slot="waterfall-bar"
                      className={cn(
                        "absolute top-0.5 bottom-0.5 rounded border",
                        kindClass,
                        isCritical && "border-2 ring-1 ring-primary/40",
                      )}
                      style={{
                        marginLeft: `${leftPct}%`,
                        width: `${widthPct}%`,
                        minWidth: 2,
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <span className="font-mono text-[11px]">
                      {row.span.name} · {row.durationMs}ms
                    </span>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
