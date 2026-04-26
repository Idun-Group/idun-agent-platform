"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceEvent, api } from "@/lib/api";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function durationLabel(events: TraceEvent[]): string {
  if (events.length === 0) return "—";
  const first = new Date(events[0].created_at).getTime();
  const last = new Date(events[events.length - 1].created_at).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last)) return "—";
  const ms = last - first;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function SessionDetail() {
  const params = useSearchParams();
  const sessionId = params.get("id") ?? "";
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [selected, setSelected] = useState<TraceEvent | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [sessionId]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["traces", "session", sessionId, "events", search],
    queryFn: () =>
      api.getSessionEvents(sessionId, {
        search: search || undefined,
      }),
    enabled: !!sessionId,
  });

  if (!sessionId) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-6xl">
        <header className="space-y-1">
          <h1 className="font-serif text-2xl font-medium text-foreground">
            Session
          </h1>
          <p className="text-sm text-muted-foreground">
            No session id supplied.
          </p>
        </header>
        <Button asChild variant="outline" className="self-start">
          <Link href="/traces/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All sessions
          </Link>
        </Button>
      </div>
    );
  }

  const events = data?.events ?? [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-6 p-6 max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 h-7 text-muted-foreground"
            >
              <Link href="/traces/">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                All sessions
              </Link>
            </Button>
          </div>
          <h1 className="font-mono text-lg font-medium text-foreground">
            {sessionId.slice(0, 16)}
            {sessionId.length > 16 ? "…" : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"} ·{" "}
            {durationLabel(events)}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh events"
        >
          <RefreshCw
            className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
        </Button>
      </header>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-border">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search events…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              type="search"
            />
          </div>
          {data?.truncated && (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Truncated
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 overflow-hidden p-0">
          <ScrollArea className="w-[320px] border-r border-border">
            {isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : events.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {search.trim()
                  ? "No events match the filter."
                  : "No events yet."}
              </div>
            ) : (
              <ul className="flex flex-col">
                {events.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(e)}
                      className={`flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                        selected?.id === e.id ? "bg-muted" : ""
                      }`}
                    >
                      <span className="font-mono text-[11px] text-foreground/80">
                        {e.event_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        seq {e.sequence} · run {e.run_id.slice(0, 8)} ·{" "}
                        {new Date(e.created_at).toLocaleTimeString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
          <div className="flex flex-1 flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="font-mono">
                      {selected.event_type}
                    </Badge>
                    <span className="text-muted-foreground">
                      seq {selected.sequence}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono text-muted-foreground">
                      {selected.run_id.slice(0, 12)}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {new Date(selected.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs text-foreground/80">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Select an event to inspect its payload.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <SessionDetail />
    </Suspense>
  );
}
