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
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  const traceId = params?.traceId ?? "";

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "waterfall">("tree");
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
  // paint. The user can clear/change it freely after that.
  const effectiveSelection = useMemo(() => {
    if (selectedSpanId) return selectedSpanId;
    return tree[0]?.span.otelSpanId ?? null;
  }, [selectedSpanId, tree]);

  const selectedSpan = useMemo(
    () => findSpan(tree, effectiveSelection),
    [tree, effectiveSelection],
  );

  const partial = useMemo(() => anyPartialCost(tree), [tree]);

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

  if (isError) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <div className="flex flex-col gap-4 p-6 max-w-3xl">
        <Link
          href="/admin/traces"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon size={14} /> Back to traces
        </Link>
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
        data-testid="trace-detail-header"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href="/admin/traces"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon size={12} /> Back to traces
          </Link>
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
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
            <StatusBadge status={data?.trace.status ?? null} />
          </div>
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

      {/* Body */}
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

        <aside
          className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background"
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trace?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the trace and all of its spans. The
              underlying agent invocation is unaffected — only the captured
              trace data is purged.
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
