"use client";

/**
 * Trace detail page client component (`/admin/traces/[traceId]`).
 *
 * Hosted by the sibling `page.tsx` server component, which exists only
 * to satisfy Next.js's `generateStaticParams` requirement on dynamic
 * routes under `output: "export"`. All actual UI work lives here.
 *
 * Three-panel composition lifted out of T5c's atoms:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header — name · latency · tokens · cost · status · [Delete]  │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ ┌──────────────── tabs ────────────────┐ ┌────────────────┐  │
 *   │ │ Tree | Waterfall                     │ │  SpanDetailRail │  │
 *   │ │ ────────────────────────────────────  │ │                │  │
 *   │ │ <TraceTree | Waterfall>               │ │ Info / Input/  │  │
 *   │ │                                       │ │ Output / Attrs │  │
 *   │ └───────────────────────────────────────┘ └────────────────┘  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Selection state is owned here and shared between the tree and the
 * waterfall — clicking a span in either view highlights it in both
 * and drives the right-rail. The view toggle is a local `useState`,
 * not part of the URL — refresh resets to "tree".
 *
 * Cost rendering follows the streaming-cost UX (Task 28): if the span's
 * `costBreakdown.partial === true` the value is prefixed with `~`. The
 * trace-level total inherits the prefix when *any* contributing span
 * is partial.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, GitBranchIcon, ListTreeIcon, Trash2Icon } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SpanDetailRail } from "@/components/traces/SpanDetailRail";
import { TraceTree } from "@/components/traces/TraceTree";
import { Waterfall } from "@/components/traces/Waterfall";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/client";
import {
  type StandaloneSpanRead,
  type StandaloneSpanTreeNode,
  deleteTrace,
  getTrace,
} from "@/lib/api/traces";
import { formatDuration } from "@/lib/format/duration";
import { formatCostUSD } from "@/lib/format/money";

/** Walk the tree depth-first to find a span by id. */
function findSpan(
  nodes: StandaloneSpanTreeNode[],
  id: string | null,
): StandaloneSpanRead | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.span.otelSpanId === id) return node.span;
    const child = findSpan(node.children, id);
    if (child) return child;
  }
  return null;
}

/** True if any span in the tree carries a partial cost breakdown. */
function anyPartialCost(nodes: StandaloneSpanTreeNode[]): boolean {
  for (const node of nodes) {
    const cb = node.span.costBreakdown as { partial?: unknown } | null;
    if (cb && cb.partial) return true;
    if (anyPartialCost(node.children)) return true;
  }
  return false;
}

/** Count every span in the tree (used to label the delete dialog). */
function countSpans(nodes: StandaloneSpanTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countSpans(node.children);
  }
  return total;
}

/** Allowed view-mode values; anything else collapses to "tree". */
type ViewMode = "tree" | "waterfall";

function isViewMode(value: string | null): value is ViewMode {
  return value === "tree" || value === "waterfall";
}

function formatTokens(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const variant: "default" | "destructive" | "secondary" =
    status === "OK" || status === "ok"
      ? "secondary"
      : status === "ERROR" || status === "error"
        ? "destructive"
        : "default";
  return (
    <Badge variant={variant} className="font-mono text-[10px]">
      {status}
    </Badge>
  );
}

export default function TraceDetailClient() {
  const params = useParams<{ traceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const traceId = params?.traceId ?? "";

  // ── URL-stateful view + selection (AUDIT.md #19, #33) ────────────────
  //
  // Both view-mode and selected span id live in the query string so a
  // refresh or shared link round-trips the operator's exact viewport.
  // The empty case must default to Tree + the root span without a flicker
  // of state — we read from `useSearchParams` once, fall back to the
  // root span id once data is loaded, and never write a default into
  // the URL (saves a back-button noise step). All writes go through
  // `router.replace` so the back arrow returns to the list, not to a
  // synthetic in-page intermediate state.
  const viewMode: ViewMode = isViewMode(searchParams?.get("view") ?? null)
    ? (searchParams!.get("view") as ViewMode)
    : "tree";

  const urlSpanId = searchParams?.get("span") ?? null;

  const writeUrlState = useCallback(
    (next: { view?: ViewMode; span?: string | null }) => {
      const qp = new URLSearchParams(searchParams?.toString() ?? "");
      if (next.view !== undefined) {
        if (next.view === "tree") qp.delete("view");
        else qp.set("view", next.view);
      }
      if (next.span !== undefined) {
        if (next.span === null || next.span.length === 0) qp.delete("span");
        else qp.set("span", next.span);
      }
      const qs = qp.toString();
      router.replace(qs.length > 0 ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const setViewMode = useCallback(
    (next: ViewMode) => {
      writeUrlState({ view: next });
    },
    [writeUrlState],
  );

  const setSelectedSpanId = useCallback(
    (next: string | null) => {
      writeUrlState({ span: next });
    },
    [writeUrlState],
  );

  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trace", traceId],
    queryFn: () => getTrace(traceId),
    enabled: traceId.length > 0,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  const tree = data?.tree ?? [];

  // Default-select the root span once the trace loads so the rail
  // shows something meaningful instead of the empty state on first
  // paint. URL-stateful selection wins; we fall back to the root span
  // when ?span= is unset OR points at an id no longer in the tree
  // (deleted span, mismatched share link).
  const urlSpanInTree = useMemo(() => {
    if (!urlSpanId) return null;
    return findSpan(tree, urlSpanId) ? urlSpanId : null;
  }, [urlSpanId, tree]);

  const effectiveSelection = useMemo(() => {
    if (urlSpanInTree) return urlSpanInTree;
    return tree[0]?.span.otelSpanId ?? null;
  }, [urlSpanInTree, tree]);

  const selectedSpan = useMemo(
    () => findSpan(tree, effectiveSelection),
    [tree, effectiveSelection],
  );

  const partial = useMemo(() => anyPartialCost(tree), [tree]);
  const totalSpanCount = useMemo(() => countSpans(tree), [tree]);

  // ── Mobile rail (AUDIT.md #40) ───────────────────────────────────────
  //
  // At <lg viewport the side-by-side layout collapses to a column;
  // the rail used to render full-width below the tree, eating the
  // entire next viewport. Wrap it in a `<Sheet>` (Radix Dialog under
  // the hood) that opens on a span click and closes on Esc / X. The
  // open state is local — we DON'T persist "rail open" to the URL
  // (transient overlay; refresh shouldn't re-open it).
  //
  // Detect "is mobile" via a `matchMedia("(max-width: lg)")` listener
  // so the rail only renders inside the Sheet on narrow viewports.
  // On wider screens the inline rail wins and the Sheet is suppressed.
  const [isNarrow, setIsNarrow] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    // Tailwind v4's `lg` breakpoint default is 1024px. The query
    // matches when width is BELOW the breakpoint (i.e. mobile / tablet).
    const mql = window.matchMedia("(max-width: 1023px)");
    const handler = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    setIsNarrow(mql.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // Safari < 14 fallback.
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  // When the operator selects a span on a narrow viewport, slide
  // the Sheet open. We trigger off the URL-driven `urlSpanInTree`
  // (which only flips when the user explicitly picks a span) so a
  // refresh with `?span=<id>` does NOT pop the sheet automatically;
  // the operator should land on the trace overview, not on a modal.
  const userSelectedSpanId = urlSpanInTree;
  const previousUserSpanIdRef = useRef<string | null>(userSelectedSpanId);
  useEffect(() => {
    if (
      userSelectedSpanId &&
      userSelectedSpanId !== previousUserSpanIdRef.current &&
      isNarrow
    ) {
      setMobileRailOpen(true);
    }
    previousUserSpanIdRef.current = userSelectedSpanId;
  }, [userSelectedSpanId, isNarrow]);

  const del = useMutation({
    mutationFn: () => deleteTrace(traceId),
    onSuccess: (result) => {
      toast.success(
        `Trace deleted (${result.deletedSpans} span${
          result.deletedSpans === 1 ? "" : "s"
        } removed)`,
      );
      router.push("/admin/traces");
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? `${err.status}`
          : err instanceof Error
            ? err.message
            : "unknown";
      toast.error(`Failed to delete trace: ${detail}`);
    },
  });

  // ── Render branches ───────────────────────────────────────────────

  // ── "Back to traces" — preserves list filter state via history ─────
  // AUDIT.md #24: a hardcoded `<Link href="/admin/traces" />` strips
  // `?model=...` and friends from the list URL. `router.back()` walks
  // the history stack, so the operator returns to whatever filter
  // state they came from. If the user landed here via a deep link
  // (no list-page entry in history), we fall back to the bare list.
  const goBackToList = useCallback(() => {
    // `window.history.length > 1` is the standard SPA heuristic; in
    // the freshly-loaded-no-history case we still want a usable Back.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/admin/traces");
    }
  }, [router]);

  if (isError) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <div className="flex flex-col gap-4 p-6 max-w-3xl">
        <button
          type="button"
          onClick={goBackToList}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon size={14} /> Back to traces
        </button>
        <div
          className="rounded-md border bg-muted/20 p-6 text-sm"
          data-testid="trace-detail-error"
        >
          {status === 404 ? (
            <>
              <p className="font-medium text-foreground">Trace not found.</p>
              <p className="mt-1 text-muted-foreground">
                It may have been deleted or expired from the retention window.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">
                Failed to load trace.
              </p>
              <p className="mt-1 text-muted-foreground">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const userId = data?.trace.userId ?? null;
  const sessionId = data?.trace.sessionId ?? null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/*
        Header — AUDIT.md #12: the previous flex-wrap row let the metric
        strip wrap UNDER the Delete button at 1280px viewports, leaving
        Delete reading like the headline metric. The grid below pins
        Delete flush right at every viewport (auto column on the right)
        and lets the title-block + metric strip flow in the 1fr column,
        so the strip wraps under the title rather than under Delete.
      */}
      <header
        className="grid items-start gap-3 border-b px-6 py-4 lg:grid-cols-[1fr_auto] lg:items-center"
        data-testid="trace-detail-header"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <button
            type="button"
            onClick={goBackToList}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            data-testid="trace-back-link"
          >
            <ArrowLeftIcon size={12} /> Back to traces
          </button>
          {isLoading ? (
            <Skeleton className="h-6 w-64" />
          ) : (
            <h1
              className="font-serif truncate text-xl font-medium text-foreground"
              title={data?.trace.name}
            >
              {data?.trace.name ?? traceId}
            </h1>
          )}
          <p className="font-mono text-[11px] text-muted-foreground">
            {traceId}
          </p>
          {/*
            Metric strip — flex-wrap under the title block. AUDIT.md #20
            adds User and Session here (conditional render — skip the
            row entirely when both are null so the chrome doesn't read
            "User: — / Session: —" on traces lacking the metadata).
          */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span data-testid="trace-summary-latency">
              <span className="text-foreground/70">Latency:</span>{" "}
              <span className="font-mono text-foreground">
                {formatDuration(data?.trace.latencyMs ?? null)}
              </span>
            </span>
            <span data-testid="trace-summary-tokens">
              <span className="text-foreground/70">Tokens:</span>{" "}
              <span className="font-mono text-foreground">
                {formatTokens(data?.trace.totalTokens ?? null)}
              </span>
            </span>
            <span data-testid="trace-summary-cost">
              <span className="text-foreground/70">Cost:</span>{" "}
              <span className="font-mono text-foreground">
                {formatCostUSD(data?.trace.totalCostUsd ?? null, { partial })}
              </span>
            </span>
            {userId ? (
              <span data-testid="trace-summary-user">
                <span className="text-foreground/70">User:</span>{" "}
                <span
                  className="font-mono text-foreground"
                  title={userId}
                >
                  {userId}
                </span>
              </span>
            ) : null}
            {sessionId ? (
              <span data-testid="trace-summary-session">
                <span className="text-foreground/70">Session:</span>{" "}
                <span
                  className="font-mono text-foreground"
                  title={sessionId}
                >
                  {sessionId}
                </span>
              </span>
            ) : null}
            <StatusBadge status={data?.trace.status ?? null} />
          </div>
        </div>

        <div className="flex justify-start lg:justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || del.isPending}
            onClick={() => setConfirmDelete(true)}
            data-testid="trace-delete-button"
          >
            <Trash2Icon className="mr-1 size-3.5" />
            Delete trace
          </Button>
        </div>
      </header>

      {/*
        Body — at <lg, single column (the rail rides in a `<Sheet>`,
        not inline). At lg+, two columns: the structure on the left,
        the rail flush right at 380px.
      */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section
          className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r"
          aria-label="Trace structure"
        >
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as "tree" | "waterfall")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="tree">
                  <ListTreeIcon className="mr-1 size-3.5" /> Tree
                </TabsTrigger>
                <TabsTrigger value="waterfall">
                  <GitBranchIcon className="mr-1 size-3.5" /> Waterfall
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {isLoading ? (
                <div className="flex flex-col gap-2" data-testid="trace-detail-skeleton">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-7 w-full" />
                  ))}
                </div>
              ) : tree.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No spans recorded for this trace.
                </p>
              ) : (
                <>
                  <TabsContent value="tree" className="mt-0">
                    <TraceTree
                      nodes={tree}
                      selectedSpanId={effectiveSelection}
                      onSelect={(span) => setSelectedSpanId(span.otelSpanId)}
                    />
                  </TabsContent>
                  <TabsContent value="waterfall" className="mt-0">
                    <Waterfall
                      nodes={tree}
                      selectedSpanId={effectiveSelection}
                      onSelect={(span) => setSelectedSpanId(span.otelSpanId)}
                    />
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </section>

        {/*
          Inline rail — desktop. Hidden below `lg`; on narrow viewports
          the rail renders inside the `<Sheet>` further down so the
          tree retains the full column width and the operator can see
          tree + rail by toggling the sheet rather than scrolling
          half a screen at a time.
        */}
        <aside
          className="hidden min-h-0 min-w-0 flex-col overflow-hidden bg-background lg:flex"
          aria-label="Span detail rail"
          data-testid="span-detail-rail"
        >
          {isLoading ? (
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <SpanDetailRail span={selectedSpan} />
          )}
        </aside>
      </div>

      {/*
        Mobile rail — AUDIT.md #40. On `<lg` viewports the rail rides
        in a `<Sheet>` (Radix Dialog) that slides in from the right.
        Esc / X close the sheet (Radix wires both natively); the
        operator's selected span is preserved across the open/close
        cycle because selection lives in the URL.
      */}
      <Sheet
        open={isNarrow && mobileRailOpen}
        onOpenChange={(next) => {
          // Sync the local "rail open" flag, but only when the
          // viewport is narrow — wide viewports never open the
          // sheet so we shouldn't react to its open-state events.
          if (isNarrow) setMobileRailOpen(next);
        }}
      >
        <SheetContent
          side="right"
          className="w-full max-w-md p-0"
          data-testid="mobile-rail-sheet"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Span detail</SheetTitle>
            <SheetDescription>
              Selected span info, payload, attributes, and events.
            </SheetDescription>
          </SheetHeader>
          {selectedSpan ? (
            <SpanDetailRail
              span={selectedSpan}
              onClose={() => setMobileRailOpen(false)}
              className="bg-popover"
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trace?</AlertDialogTitle>
            {/*
              AUDIT.md #25 — show the actual span count instead of a
              vague "all of its spans". `tree` is already loaded at the
              moment the dialog opens, so the count is free. We
              fall back to a generic phrasing only when the tree is
              empty (orphaned trace row, edge case).
            */}
            <AlertDialogDescription data-testid="trace-delete-description">
              {totalSpanCount > 0 ? (
                <>
                  This permanently removes the trace and its{" "}
                  <span className="font-medium text-foreground">
                    {totalSpanCount}
                  </span>{" "}
                  span{totalSpanCount === 1 ? "" : "s"}. The underlying agent
                  invocation is unaffected — only the captured trace data is
                  purged.
                </>
              ) : (
                <>
                  This permanently removes the trace. The underlying agent
                  invocation is unaffected — only the captured trace data is
                  purged.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => del.mutate()}
              disabled={del.isPending}
              data-testid="trace-delete-confirm"
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
