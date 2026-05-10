"use client";

/**
 * Recursive ARIA tree view for a trace's span hierarchy.
 *
 * Hand-rolled per the locked stack decision (`tasks/trace-feature-08-05-2026/
 * 11-frontend-tree-libs.md` § 7 "Recommendation"): the v1 cap is < 500 spans
 * per trace, so we keep the row layout fully under our control rather than
 * paying for `@headless-tree/react`'s 9.5 kB. Escalation path documented in
 * the KB if this ceases to hold.
 *
 * Implements the W3C ARIA tree pattern
 * (https://www.w3.org/WAI/ARIA/apg/patterns/treeview/):
 *
 * - Container has `role="tree"`. Each row has `role="treeitem"` with
 *   `aria-level` (1-based), `aria-posinset`, `aria-setsize`, and
 *   `aria-expanded` on parent rows.
 * - Roving tabindex: only the focused row receives `tabIndex={0}`; all
 *   others get `tabIndex={-1}`. The focused row is tracked locally so
 *   keyboard navigation does not require remounts.
 * - Keyboard map (per APG):
 *     ↑ / ↓     — previous / next visible row
 *     →         — expand if collapsed; if already expanded, focus first child
 *     ←         — collapse if expanded; if collapsed, focus parent
 *     Home/End  — first / last visible row
 *     Enter / Space — select (calls `onSelect` with the span)
 *
 * Selection state is **lifted** to the parent (the trace detail page)
 * — the tree takes `selectedSpanId` and `onSelect` props so the
 * `SpanDetailRail` on the right of the layout renders the same span.
 *
 * Uses `shadcn/Collapsible` for the expand/collapse hook, but the
 * disclosure animation is the only thing it owns; everything else is
 * native React state so we keep total control over the row chrome.
 */

import { ChevronRightIcon } from "lucide-react";
import * as React from "react";

import { SpanKindIcon } from "@/components/traces/SpanKindIcon";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type { StandaloneSpanRead, StandaloneSpanTreeNode } from "@/lib/api/traces";
import { cn } from "@/lib/utils";

const INDENT_PX = 16;

/** A single visible row in the flattened tree (parents collapsed → no children). */
type VisibleRow = {
  id: string;
  span: StandaloneSpanRead;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  posInSet: number;
  setSize: number;
  parentId: string | null;
};

export type TraceTreeProps = {
  nodes: StandaloneSpanTreeNode[];
  selectedSpanId: string | null;
  onSelect: (span: StandaloneSpanRead) => void;
  /** Optional starter set of expanded span ids; defaults to "all expanded". */
  initialExpanded?: ReadonlySet<string>;
  className?: string;
};

/**
 * Flatten the tree into a list of currently-visible rows. Rows whose
 * parent is collapsed are omitted. Order is depth-first, matching the
 * visual layout — that's what arrow-up/down step through.
 */
function flatten(
  nodes: StandaloneSpanTreeNode[],
  expanded: ReadonlySet<string>,
): VisibleRow[] {
  const rows: VisibleRow[] = [];

  function visit(
    node: StandaloneSpanTreeNode,
    depth: number,
    posInSet: number,
    setSize: number,
    parentId: string | null,
  ): void {
    const id = node.span.otelSpanId;
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(id);
    rows.push({
      id,
      span: node.span,
      depth,
      hasChildren,
      expanded: isExpanded,
      posInSet,
      setSize,
      parentId,
    });
    if (hasChildren && isExpanded) {
      for (let i = 0; i < node.children.length; i += 1) {
        visit(node.children[i], depth + 1, i + 1, node.children.length, id);
      }
    }
  }

  for (let i = 0; i < nodes.length; i += 1) {
    visit(nodes[i], 0, i + 1, nodes.length, null);
  }
  return rows;
}

/** Collect every span id in the tree — used as the default expanded set. */
function collectAllIds(nodes: StandaloneSpanTreeNode[]): Set<string> {
  const out = new Set<string>();
  function walk(node: StandaloneSpanTreeNode): void {
    out.add(node.span.otelSpanId);
    for (const child of node.children) walk(child);
  }
  for (const n of nodes) walk(n);
  return out;
}

/**
 * Walk back up the parent chain from ``targetId`` and return the set
 * of every ancestor's ``otelSpanId``. Used when a sibling component
 * (the Waterfall) selects a span whose ancestors are collapsed in
 * this tree -- we expand the chain so the row becomes visible.
 *
 * Returns an empty set when the target id is not in the tree.
 */
function collectAncestorIds(
  nodes: StandaloneSpanTreeNode[],
  targetId: string,
): Set<string> {
  const out = new Set<string>();
  function visit(
    node: StandaloneSpanTreeNode,
    chain: readonly string[],
  ): boolean {
    if (node.span.otelSpanId === targetId) {
      for (const id of chain) out.add(id);
      return true;
    }
    const next = [...chain, node.span.otelSpanId];
    for (const child of node.children) {
      if (visit(child, next)) return true;
    }
    return false;
  }
  for (const n of nodes) {
    if (visit(n, [])) break;
  }
  return out;
}

/** Format a token count, falling back to em-dash for null/zero. */
function formatTokens(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

/** Format a USD cost; never returns null because we want the cell to render. */
function formatCost(span: StandaloneSpanRead): string {
  if (span.costUsd === null || span.costUsd === undefined) return "—";
  const partial = isPartialCost(span);
  const value = span.costUsd;
  // Up to 4 fraction digits — typical LLM costs sit at $0.0001–$0.10.
  const formatted = `$${value.toFixed(4)}`;
  return partial ? `~${formatted}` : formatted;
}

function isPartialCost(span: StandaloneSpanRead): boolean {
  return Boolean(
    span.costBreakdown && (span.costBreakdown as { partial?: unknown }).partial,
  );
}

function formatLatency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString()}ms`;
}

export function TraceTree({
  nodes,
  selectedSpanId,
  onSelect,
  initialExpanded,
  className,
}: TraceTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() =>
    initialExpanded ? new Set(initialExpanded) : collectAllIds(nodes),
  );
  const [focusedId, setFocusedId] = React.useState<string | null>(() => {
    return selectedSpanId ?? nodes[0]?.span.otelSpanId ?? null;
  });

  // Re-derive the expanded set when the tree itself changes (e.g. user
  // navigated to a different trace). Keep ids that still exist; add new
  // ones default-expanded.
  const treeKey = React.useMemo(() => {
    return nodes.map((n) => n.span.otelSpanId).join(",");
  }, [nodes]);
  React.useEffect(() => {
    setExpanded((prev) => {
      const all = collectAllIds(nodes);
      // Default-expand any new id; preserve user collapses for existing ids.
      const next = new Set<string>();
      for (const id of all) {
        if (!prev.has(id) && initialExpanded === undefined) {
          // New id, no override — default expanded.
          next.add(id);
        } else if (prev.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
    // Initial-expanded override only fires on the initial mount; after
    // that the user controls. We intentionally exclude `initialExpanded`
    // from the dep list so external changes don't clobber user state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeKey]);

  // External selection (e.g. clicking a bar in the Waterfall) must
  // make the row visible here, even if one of its ancestors is
  // collapsed. Expand the entire ancestor chain when ``selectedSpanId``
  // changes from the outside, then move focus to the selected row.
  React.useEffect(() => {
    if (selectedSpanId === null) return;
    const ancestors = collectAncestorIds(nodes, selectedSpanId);
    if (ancestors.size === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setFocusedId(selectedSpanId);
  }, [selectedSpanId, nodes]);

  const rows = React.useMemo(() => flatten(nodes, expanded), [nodes, expanded]);

  // If the focused row vanished (e.g. its parent collapsed), bring focus
  // back to the nearest remaining ancestor or the first row.
  React.useEffect(() => {
    if (focusedId !== null && !rows.some((r) => r.id === focusedId)) {
      setFocusedId(rows[0]?.id ?? null);
    }
  }, [rows, focusedId]);

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAndFocus = React.useCallback(
    (row: VisibleRow) => {
      setFocusedId(row.id);
      onSelect(row.span);
    },
    [onSelect],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0) return;
      const currentIndex = focusedId
        ? rows.findIndex((r) => r.id === focusedId)
        : 0;
      const current = rows[currentIndex] ?? rows[0];

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const next = rows[Math.min(currentIndex + 1, rows.length - 1)];
          if (next) setFocusedId(next.id);
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          const next = rows[Math.max(currentIndex - 1, 0)];
          if (next) setFocusedId(next.id);
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          if (current.hasChildren && !current.expanded) {
            toggle(current.id);
          } else if (current.hasChildren && current.expanded) {
            const firstChild = rows[currentIndex + 1];
            if (firstChild && firstChild.depth === current.depth + 1) {
              setFocusedId(firstChild.id);
            }
          }
          break;
        }
        case "ArrowLeft": {
          event.preventDefault();
          if (current.hasChildren && current.expanded) {
            toggle(current.id);
          } else if (current.parentId) {
            setFocusedId(current.parentId);
          }
          break;
        }
        case "Home": {
          event.preventDefault();
          setFocusedId(rows[0].id);
          break;
        }
        case "End": {
          event.preventDefault();
          setFocusedId(rows[rows.length - 1].id);
          break;
        }
        case "Enter":
        case " ": {
          event.preventDefault();
          selectAndFocus(current);
          break;
        }
        default:
          break;
      }
    },
    [focusedId, rows, selectAndFocus, toggle],
  );

  return (
    <div
      role="tree"
      aria-label="Span tree"
      className={cn("flex flex-col text-sm", className)}
      onKeyDown={handleKeyDown}
    >
      {rows.map((row) => {
        const isFocused = row.id === focusedId;
        const isSelected = row.id === selectedSpanId;
        return (
          <Collapsible key={row.id} open={row.expanded}>
            <div
              role="treeitem"
              aria-level={row.depth + 1}
              aria-posinset={row.posInSet}
              aria-setsize={row.setSize}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              aria-selected={isSelected}
              tabIndex={isFocused ? 0 : -1}
              data-span-id={row.id}
              data-depth={row.depth}
              className={cn(
                "group/row flex items-center gap-2 rounded-md px-2 py-1.5 outline-none",
                "hover:bg-muted/50",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isSelected && "bg-muted text-foreground",
              )}
              style={{ paddingLeft: row.depth * INDENT_PX + 8 }}
              onClick={(event) => {
                // If the user clicked on the chevron, toggle; otherwise select.
                const target = event.target as HTMLElement;
                if (target.closest("[data-tree-chevron]")) {
                  toggle(row.id);
                } else {
                  selectAndFocus(row);
                }
              }}
              onFocus={() => setFocusedId(row.id)}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                data-tree-chevron=""
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform",
                  row.hasChildren ? "visible" : "invisible",
                  row.expanded && "rotate-90",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(row.id);
                }}
              >
                <ChevronRightIcon size={14} />
              </button>
              <SpanKindIcon kind={row.span.kind} size={14} />
              <span
                className="min-w-0 flex-1 truncate text-foreground"
                title={row.span.name}
              >
                {row.span.name}
              </span>
              <span
                data-slot="latency-badge"
                className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums"
              >
                {formatLatency(row.span.latencyMs)}
              </span>
              <span
                data-slot="tokens-badge"
                className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums"
              >
                {formatTokens(row.span.totalTokens)}
              </span>
              <span
                data-slot="cost-badge"
                className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums"
              >
                {formatCost(row.span)}
              </span>
            </div>
            {/*
              Empty CollapsibleContent — the actual children are siblings
              flattened by depth-first walk, not nested inside
              CollapsibleContent. This keeps the W3C tree's "siblings of
              the same level are siblings in the DOM" invariant intact.
              Collapsible is here purely for the data-state hook on the
              parent row so styling can react to open/closed.
            */}
            <CollapsibleContent />
          </Collapsible>
        );
      })}
    </div>
  );
}
