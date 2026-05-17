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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Columns, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { formatDuration } from "@/lib/format/duration";
import { formatCostUSD } from "@/lib/format/money";
import { cn } from "@/lib/utils";

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
  // Trim every string field so a stray space (typed and deleted) doesn't
  // flow to the API as `WHERE x = ' '` and silently zero the result set
  // (#35). The filter `<Select>`s already produce trimmed values; the
  // search input never bypasses `onApplySearch` which trims on read.
  const out: StandaloneTraceListFilters = { limit: PAGE_SIZE };
  const model = state.model.trim();
  const status = state.status.trim();
  const userId = state.userId.trim();
  const sessionId = state.sessionId.trim();
  const nameContains = state.nameContains.trim();
  if (model) out.model = model;
  if (status) out.status = status;
  if (userId) out.userId = userId;
  if (sessionId) out.sessionId = sessionId;
  if (nameContains) out.nameContains = nameContains;
  return out;
}

// Format a UTC timestamp into the operator's local time with a short
// timezone label (e.g. "5/10/2026, 10:51:12 AM PDT") so a trace from a
// remote server isn't ambiguous (#36). `dateStyle`/`timeStyle` cannot
// be combined with `timeZoneName` per the ECMA-402 spec — explicit
// fields it is.
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

function formatDateTime(value: string): string {
  try {
    return DATE_TIME_FORMATTER.format(new Date(value));
  } catch {
    return value;
  }
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

type TracePageBucket = {
  cursor: string | null;
  items: StandaloneTraceListItem[];
};

export default function TracesPage() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [pages, setPages] = useState<TracePageBucket[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [visibleColumns, setVisibleColumns] = useState<
    Record<ToggleableKey, boolean>
  >({ userId: false, sessionId: false, tags: false });
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  // Wire the active page to the cursor; the accumulator merges pages.
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["traces", "list", apiFilters, cursor ?? null],
    queryFn: () => listTraces({ ...apiFilters, cursor }),
  });

  // Filter mutations have to flush ``cursor`` and ``pages`` in the same
  // React batch as the filter change. Splitting the resets into a
  // ``useEffect([apiFilters])`` left a one-render window where the query
  // would fire with new filters + the old cursor, returning a stale page
  // that then accumulated into the new filter view.
  const updateFilters = (next: (prev: FilterState) => FilterState) => {
    setCursor(undefined);
    setPages([]);
    setFilters(next);
  };

  // Merge the latest page into the accumulator, keyed by the cursor that
  // produced it. Identity-based dedup (the previous heuristic) misses
  // refetches that return a fresh array with the same content, which
  // would silently duplicate rows.
  useEffect(() => {
    if (!data) return;
    const pageCursor = cursor ?? null;
    setPages((prev) => {
      const idx = prev.findIndex((bucket) => bucket.cursor === pageCursor);
      if (idx >= 0) {
        const replaced = prev.slice();
        replaced[idx] = { cursor: pageCursor, items: data.items };
        return replaced;
      }
      return [...prev, { cursor: pageCursor, items: data.items }];
    });
  }, [data, cursor]);

  const items = useMemo(() => pages.flatMap((bucket) => bucket.items), [pages]);

  // Build the filter dropdowns from the loaded set so the operator picks
  // from observed values. No dedicated "list distinct" endpoint yet —
  // the deferred-from-#606 anchor (#7 in the audit) lives on the page
  // because the API would have to grow per-column-distinct routes to
  // populate cross-page values. The "(observed in this page)" caption
  // on the dropdowns sets the right expectation.
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((row) => row.models.forEach((m) => set.add(m)));
    return Array.from(set).sort();
  }, [items]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((row) => {
      if (row.status) set.add(row.status);
    });
    return Array.from(set).sort();
  }, [items]);

  const userOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((row) => {
      if (row.userId) set.add(row.userId);
    });
    return Array.from(set).sort();
  }, [items]);

  const sessionOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((row) => {
      if (row.sessionId) set.add(row.sessionId);
    });
    return Array.from(set).sort();
  }, [items]);

  const onApplySearch = () => {
    updateFilters((prev) => ({ ...prev, nameContains: searchInput.trim() }));
  };

  // Order matters: clear the search input *first* so the operator never
  // sees a one-frame flash of "filters reset but search box still has
  // my old text" (#9). Blur to release any focus ring on the now-empty
  // input.
  const onResetFilters = () => {
    setSearchInput("");
    searchInputRef.current?.blur();
    updateFilters(() => EMPTY_FILTERS);
  };

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["traces", "list"] });
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
              ref={searchInputRef}
              value={searchInput}
              placeholder="Search by name prefix"
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
              updateFilters((prev) => ({ ...prev, model: v === ANY_VALUE ? "" : v }))
            }
          >
            <SelectTrigger className="w-44" data-testid="filter-model">
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
          <Select
            value={filters.status || ANY_VALUE}
            onValueChange={(v) =>
              updateFilters((prev) => ({
                ...prev,
                status: v === ANY_VALUE ? "" : v,
              }))
            }
          >
            <SelectTrigger
              id="trace-status"
              className="w-36"
              data-testid="filter-status"
            >
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any status</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="trace-user"
            className="text-xs font-medium text-muted-foreground"
          >
            User
          </label>
          <Select
            value={filters.userId || ANY_VALUE}
            onValueChange={(v) =>
              updateFilters((prev) => ({
                ...prev,
                userId: v === ANY_VALUE ? "" : v,
              }))
            }
          >
            <SelectTrigger
              id="trace-user"
              className="w-44"
              data-testid="filter-user"
            >
              <SelectValue placeholder="Any user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any user</SelectItem>
              <SelectGroup>
                <SelectLabel className="px-2 py-1 text-[10px] font-normal text-muted-foreground">
                  (observed in this page)
                </SelectLabel>
                {userOptions.length === 0 ? (
                  <span className="block px-2 py-1.5 text-xs text-muted-foreground">
                    No users on this page
                  </span>
                ) : (
                  userOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="trace-session"
            className="text-xs font-medium text-muted-foreground"
          >
            Session
          </label>
          <Select
            value={filters.sessionId || ANY_VALUE}
            onValueChange={(v) =>
              updateFilters((prev) => ({
                ...prev,
                sessionId: v === ANY_VALUE ? "" : v,
              }))
            }
          >
            <SelectTrigger
              id="trace-session"
              className="w-44"
              data-testid="filter-session"
            >
              <SelectValue placeholder="Any session" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any session</SelectItem>
              <SelectGroup>
                <SelectLabel className="px-2 py-1 text-[10px] font-normal text-muted-foreground">
                  (observed in this page)
                </SelectLabel>
                {sessionOptions.length === 0 ? (
                  <span className="block px-2 py-1.5 text-xs text-muted-foreground">
                    No sessions on this page
                  </span>
                ) : (
                  sessionOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pl-1">
          <Button onClick={onApplySearch} variant="default" size="sm">
            Apply
          </Button>
          <Button
            onClick={onRefresh}
            variant="outline"
            size="sm"
            disabled={isFetching}
            aria-label="Refresh traces"
            data-testid="refresh-button"
          >
            <RefreshCw
              className={cn(
                "size-4",
                isFetching && "animate-spin",
              )}
            />
          </Button>
          <Button onClick={onResetFilters} variant="outline" size="sm">
            Reset
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="columns-toggle"
                disabled={isFetching}
              >
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

      <div
        className="rounded-md border"
        data-testid="trace-table-wrapper"
        aria-busy={isLoading}
      >
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
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`/admin/traces/${row.otelTraceId}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.models.length > 0 ? (
                        <span
                          className="font-mono text-[11px] text-muted-foreground"
                          data-testid="trace-row-model-subtitle"
                        >
                          {row.models[0]}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(row.startedAt)}
                  </TableCell>
                  <TableCell>{formatDuration(row.latencyMs)}</TableCell>
                  <TableCell>{formatTokens(row.totalTokens)}</TableCell>
                  <TableCell>{formatCostUSD(row.totalCostUsd)}</TableCell>
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
          <span
            className="text-xs text-muted-foreground"
            data-testid="end-of-results"
          >
            Showing {items.length.toLocaleString()} trace
            {items.length === 1 ? "" : "s"} · End of results.
          </span>
        ) : null}
      </div>
    </div>
  );
}
