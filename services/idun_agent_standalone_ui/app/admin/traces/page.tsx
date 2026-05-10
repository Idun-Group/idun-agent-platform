"use client";

/**
 * Trace list view (`/admin/traces`).
 *
 * Default columns: name, started_at, latency_ms, total_tokens,
 * total_cost_usd, models, status. Three more (user_id, session_id,
 * tags) live behind the column-toggle dropdown.
 *
 * Pagination is cursor-based — the API returns ``nextCursor`` per
 * page; we accumulate pages locally on every "Load more" click. The
 * filter bar resets the accumulator. The SqliteBanner sits at the top
 * and renders only when the standalone is on SQLite (it self-fetches
 * the dialect via the traces health endpoint).
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Columns, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PipelineHealthPanel } from "@/components/traces/PipelineHealthPanel";
import { SqliteBanner } from "@/components/traces/SqliteBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type StandaloneTraceListFilters,
  type StandaloneTraceListItem,
  listTraces,
} from "@/lib/api/traces";

type ToggleableKey = "userId" | "sessionId" | "tags";

const TOGGLEABLE_LABELS: Record<ToggleableKey, string> = {
  userId: "User",
  sessionId: "Session",
  tags: "Tags",
};

const PAGE_SIZE = 50;
const ANY_VALUE = "__any__";

type FilterState = {
  model: string;
  status: string;
  userId: string;
  sessionId: string;
  nameContains: string;
};

const EMPTY_FILTERS: FilterState = {
  model: "",
  status: "",
  userId: "",
  sessionId: "",
  nameContains: "",
};

function toApiFilters(state: FilterState): StandaloneTraceListFilters {
  const out: StandaloneTraceListFilters = { limit: PAGE_SIZE };
  if (state.model) out.model = state.model;
  if (state.status) out.status = state.status;
  if (state.userId) out.userId = state.userId;
  if (state.sessionId) out.sessionId = state.sessionId;
  if (state.nameContains) out.nameContains = state.nameContains;
  return out;
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatCost(usd: number | null): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
}

function formatTokens(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function ModelChips({ models }: { models: string[] }) {
  if (!models.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {models.map((m) => (
        <Badge key={m} variant="secondary" className="font-mono text-[11px]">
          {m}
        </Badge>
      ))}
    </div>
  );
}

function StatusCell({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const tone =
    status === "OK" || status === "ok"
      ? "text-emerald-700 dark:text-emerald-300"
      : status === "ERROR" || status === "error"
        ? "text-destructive"
        : "text-muted-foreground";
  return <span className={tone}>{status}</span>;
}

export default function TracesPage() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [pages, setPages] = useState<StandaloneTraceListItem[][]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [visibleColumns, setVisibleColumns] = useState<
    Record<ToggleableKey, boolean>
  >({ userId: false, sessionId: false, tags: false });

  // Wire the active page to the cursor; the accumulator merges pages.
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["traces", "list", apiFilters, cursor ?? null],
    queryFn: () => listTraces({ ...apiFilters, cursor }),
  });

  // Reset accumulator + cursor whenever the filter shape changes.
  useEffect(() => {
    setPages([]);
    setCursor(undefined);
  }, [apiFilters]);

  // Merge the latest page into the accumulator.
  useEffect(() => {
    if (!data) return;
    setPages((prev) => {
      // Avoid duplicate appends if React Query re-renders with the
      // same data reference: only push when the last page identity
      // doesn't match the response.
      if (prev.length > 0 && prev[prev.length - 1] === data.items) return prev;
      return [...prev, data.items];
    });
  }, [data]);

  const items = useMemo(() => pages.flat(), [pages]);

  // Build the model dropdown from the loaded set so the user picks
  // from observed values. (No dedicated "list models" endpoint yet.)
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((row) => row.models.forEach((m) => set.add(m)));
    return Array.from(set).sort();
  }, [items]);

  const onApplySearch = () => {
    setFilters((prev) => ({ ...prev, nameContains: searchInput.trim() }));
  };

  const onResetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
  };

  const onLoadMore = () => {
    if (data?.nextCursor) setCursor(data.nextCursor);
  };

  // ``isError`` takes precedence over ``showEmpty`` so a failed
  // request does not masquerade as "no traces yet" -- a 401, 500, or
  // network error must be visible to the operator.
  const showEmpty =
    !isLoading && !isError && items.length === 0 && !data?.nextCursor;
  const totalColumns = 7 + Object.values(visibleColumns).filter(Boolean).length;
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unable to load traces.";

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Traces
        </h1>
        <p className="text-sm text-muted-foreground">
          Recent agent invocations captured by the local trace pipeline.
        </p>
      </header>

      <SqliteBanner />

      <PipelineHealthPanel />

      <div className="flex flex-wrap items-end gap-3" data-testid="filter-bar">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="trace-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Search name
          </label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="trace-search"
              value={searchInput}
              placeholder="agent.run, my-graph…"
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApplySearch();
              }}
              className="pl-8 w-56"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Model
          </label>
          <Select
            value={filters.model || ANY_VALUE}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, model: v === ANY_VALUE ? "" : v }))
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Any model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any model</SelectItem>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="trace-status"
            className="text-xs font-medium text-muted-foreground"
          >
            Status
          </label>
          <Input
            id="trace-status"
            value={filters.status}
            placeholder="OK / ERROR"
            className="w-32"
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, status: e.target.value }))
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="trace-user"
            className="text-xs font-medium text-muted-foreground"
          >
            User
          </label>
          <Input
            id="trace-user"
            value={filters.userId}
            placeholder="user@host"
            className="w-40"
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, userId: e.target.value }))
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="trace-session"
            className="text-xs font-medium text-muted-foreground"
          >
            Session
          </label>
          <Input
            id="trace-session"
            value={filters.sessionId}
            placeholder="session id"
            className="w-40"
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, sessionId: e.target.value }))
            }
          />
        </div>

        <div className="flex items-center gap-2 pl-1">
          <Button onClick={onApplySearch} variant="default" size="sm">
            Apply
          </Button>
          <Button onClick={onResetFilters} variant="outline" size="sm">
            Reset
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="columns-toggle">
                <Columns className="mr-1 size-4" /> Columns{" "}
                <ChevronDown className="ml-1 size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Optional columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(TOGGLEABLE_LABELS) as ToggleableKey[]).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={visibleColumns[key]}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((prev) => ({ ...prev, [key]: !!checked }))
                  }
                >
                  {TOGGLEABLE_LABELS[key]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border" data-testid="trace-table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Models</TableHead>
              <TableHead>Status</TableHead>
              {visibleColumns.userId && <TableHead>User</TableHead>}
              {visibleColumns.sessionId && <TableHead>Session</TableHead>}
              {visibleColumns.tags && <TableHead>Tags</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && pages.length === 0 ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <TableRow key={`sk-${idx}`} data-testid="trace-skeleton-row">
                  {Array.from({ length: totalColumns }).map((_, cidx) => (
                    <TableCell key={cidx}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={totalColumns}
                  className="py-12 text-center text-sm"
                  data-testid="trace-list-error"
                >
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <span className="font-medium">Could not load traces.</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {errorMessage}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : showEmpty ? (
              <TableRow>
                <TableCell
                  colSpan={totalColumns}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  No traces yet — run an agent invocation to see traces appear
                  here.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.otelTraceId} data-testid="trace-row">
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/traces/${row.otelTraceId}`}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(row.startedAt)}
                  </TableCell>
                  <TableCell>{formatLatency(row.latencyMs)}</TableCell>
                  <TableCell>{formatTokens(row.totalTokens)}</TableCell>
                  <TableCell>{formatCost(row.totalCostUsd)}</TableCell>
                  <TableCell>
                    <ModelChips models={row.models} />
                  </TableCell>
                  <TableCell>
                    <StatusCell status={row.status} />
                  </TableCell>
                  {visibleColumns.userId && (
                    <TableCell className="text-muted-foreground">
                      {row.userId ?? "—"}
                    </TableCell>
                  )}
                  {visibleColumns.sessionId && (
                    <TableCell className="text-muted-foreground">
                      {row.sessionId ?? "—"}
                    </TableCell>
                  )}
                  {visibleColumns.tags && (
                    <TableCell>
                      {row.tags.length ? (
                        <div className="flex flex-wrap gap-1">
                          {row.tags.map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-center pb-2">
        {data?.nextCursor ? (
          <Button
            onClick={onLoadMore}
            variant="outline"
            disabled={isFetching}
            data-testid="load-more"
          >
            {isFetching ? "Loading…" : "Load more"}
          </Button>
        ) : items.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            End of results.
          </span>
        ) : null}
      </div>
    </div>
  );
}
