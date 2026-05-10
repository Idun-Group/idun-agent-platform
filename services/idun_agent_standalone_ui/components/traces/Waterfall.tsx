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

import { inferKind } from "@/components/traces/_kind";
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
 * Compute the set of span ids on the critical path.
 *
 * Definition (AUDIT.md #16): the critical path is a chain from each
 * root to a leaf where every step picks the longest-duration child of
 * the current node. Walks top-down recursively: root → longest child →
 * recurse. The set of all visited span ids is the critical path.
 *
 * The previous implementation grouped spans by tree depth and picked
 * the longest at each depth — but those longest-per-depth spans are
 * frequently in different subtrees, so the highlighted "path" was not
 * a connected chain at all. The conceptual definition of a critical
 * path requires connectedness from root to leaf.
 *
 * Memoised at the trace level by the caller — recomputing per row
 * would be quadratic.
 *
 * Takes the tree (for child-walking) and the flat list (only used to
 * fall back to {} when empty); the flat list also encodes the parsed
 * `durationMs` we use to break ties between siblings.
 */
function criticalPathIds(
  nodes: StandaloneSpanTreeNode[],
  flat: FlatSpan[],
): Set<string> {
  const out = new Set<string>();
  if (flat.length === 0) return out;

  // Build an id → durationMs lookup so child comparisons reuse the
  // already-parsed timestamps from `flattenForWaterfall`. Missing ids
  // (shouldn't happen — flat is built from the tree) fall back to the
  // span's `latencyMs`, then 0.
  const durationByid = new Map<string, number>();
  for (const f of flat) {
    durationByid.set(f.span.otelSpanId, f.durationMs);
  }

  function nodeDuration(node: StandaloneSpanTreeNode): number {
    const fromFlat = durationByid.get(node.span.otelSpanId);
    if (fromFlat !== undefined) return fromFlat;
    return node.span.latencyMs ?? 0;
  }

  function walk(node: StandaloneSpanTreeNode): void {
    out.add(node.span.otelSpanId);
    if (node.children.length === 0) return;
    let longest = node.children[0];
    let longestDur = nodeDuration(longest);
    for (let i = 1; i < node.children.length; i += 1) {
      const candidate = node.children[i];
      const dur = nodeDuration(candidate);
      if (dur > longestDur) {
        longest = candidate;
        longestDur = dur;
      }
    }
    walk(longest);
  }

  for (const root of nodes) walk(root);
  return out;
}

/**
 * Test-only re-exports. Vitest imports these to assert the helpers
 * directly without rendering the React component. Prefixed with `__`
 * to discourage non-test consumers; the public API remains the
 * `Waterfall` component below.
 */
export { criticalPathIds as __computeCriticalPathIds };
export { flattenForWaterfall as __flattenForWaterfall };

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
    () => criticalPathIds(nodes, flatSpans),
    [nodes, flatSpans],
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
        role="group"
        aria-label="Span waterfall"
        className={cn("flex flex-col gap-1 text-xs", className)}
      >
        {flatSpans.map((row) => {
          const leftPct =
            ((row.startedAtMs - bounds.traceStartMs) / bounds.total) * 100;
          const widthPct = (row.durationMs / bounds.total) * 100;
          const isSelected = row.span.otelSpanId === selectedSpanId;
          const isCritical = critical.has(row.span.otelSpanId);
          // Route through ``inferKind`` so ADK spans (kind=INTERNAL,
          // no ``openinference.span.kind`` attribute) pick up the
          // per-kind palette rather than the muted-grey fallback.
          const resolvedKind =
            inferKind(row.span) ?? row.span.kind?.toUpperCase();
          const kindClass =
            (resolvedKind && KIND_BAR_CLASS[resolvedKind]) ?? FALLBACK_BAR_CLASS;

          return (
            <div
              key={row.span.otelSpanId}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Span ${row.span.name}, ${row.durationMs} ms`}
              data-span-id={row.span.otelSpanId}
              data-critical={isCritical || undefined}
              data-selected={isSelected || undefined}
              className={cn(
                "group/wf-row grid cursor-pointer grid-cols-[200px_1fr] items-center gap-3 rounded-md px-2 py-1 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
                isSelected && "bg-muted",
              )}
              onClick={() => onSelect(row.span)}
              onKeyDown={(event) => {
                // Activate on Enter or Space, matching the WAI-ARIA
                // button pattern. ``preventDefault`` on Space stops the
                // page from scrolling.
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(row.span);
                }
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <SpanKindIcon span={row.span} size={14} />
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
