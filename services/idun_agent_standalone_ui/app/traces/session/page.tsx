"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { type TraceEvent, api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

const FILTERS = ["All", "Messages", "Tools", "Thinking", "Errors"] as const;

function eventCategory(t: string): string {
  if (t.includes("Text") || t.includes("Message")) return "Messages";
  if (t.includes("Tool")) return "Tools";
  if (t.includes("Thinking")) return "Thinking";
  if (t.includes("Error")) return "Errors";
  return "Other";
}

function SessionDetail() {
  const params = useSearchParams();
  const sessionId = params.get("id") ?? "";
  const [view, setView] = useState<"timeline" | "waterfall">("timeline");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [selected, setSelected] = useState<TraceEvent | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["traces", "session", sessionId, "events"],
    queryFn: () => api.getSessionEvents(sessionId),
    enabled: !!sessionId,
  });

  const events = data?.events ?? [];
  const grouped = useMemo(() => {
    const m = new Map<string, TraceEvent[]>();
    for (const e of events) {
      if (filter !== "All" && eventCategory(e.event_type) !== filter) continue;
      m.set(e.run_id, [...(m.get(e.run_id) ?? []), e]);
    }
    return Array.from(m.entries());
  }, [events, filter]);

  if (!sessionId) return <div className="p-6">No session id.</div>;
  if (isLoading) return <div className="p-6">Loading…</div>;

  return (
    <div className="grid grid-cols-[1fr_300px] h-full">
      <div className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] text-xs">
          <span className="font-mono text-[var(--color-fg)]/60">
            {sessionId.slice(0, 12)}…
          </span>
          <span className="text-[var(--color-fg)]/40">·</span>
          <span>{events.length} events</span>
          <div className="ml-4 flex gap-1">
            <button
              type="button"
              onClick={() => setView("timeline")}
              className={`px-2 py-0.5 rounded ${view === "timeline" ? "bg-[var(--color-muted)]" : ""}`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setView("waterfall")}
              className={`px-2 py-0.5 rounded ${view === "waterfall" ? "bg-[var(--color-muted)]" : ""}`}
            >
              Waterfall
            </button>
          </div>
          <div className="ml-auto flex gap-1">
            {FILTERS.map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded ${filter === f ? "bg-[var(--color-primary)] text-white" : "hover:bg-[var(--color-muted)]"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {view === "waterfall" ? (
            <div className="p-8 grid place-items-center h-full">
              <div className="max-w-md text-center space-y-3">
                <Badge tone="warning">Preview — available in MVP-2</Badge>
                <h3 className="font-semibold">Waterfall view</h3>
                <p className="text-sm text-[var(--color-fg)]/70">
                  LLM call-level timing, graph node spans, and model/cost
                  attribution land in MVP-2.
                </p>
              </div>
            </div>
          ) : grouped.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-fg)]/60">
              No events match the current filter.
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {grouped.map(([runId, runEvents]) => (
                <div
                  key={runId}
                  className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-bg)]"
                >
                  <div className="flex items-center gap-2 text-xs mb-2">
                    <span className="font-mono text-[var(--color-fg)]/60">
                      run {runId.slice(0, 8)}
                    </span>
                    <span className="text-[var(--color-fg)]/40">
                      {runEvents.length} events
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {runEvents.map((e) => (
                      <button
                        type="button"
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className={`text-left text-xs px-2 py-1 rounded flex gap-2 hover:bg-[var(--color-muted)] ${selected?.id === e.id ? "bg-[var(--color-muted)]" : ""}`}
                      >
                        <span className="font-mono text-[var(--color-fg)]/70 w-40 truncate">
                          {e.event_type}
                        </span>
                        <span className="flex-1 truncate text-[var(--color-fg)]/80">
                          {JSON.stringify(e.payload).slice(0, 200)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {data?.truncated && (
                <Badge tone="warning">
                  Truncated — showing first 1000 events.
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
      <aside className="border-l border-[var(--color-border)] overflow-auto p-3 bg-[var(--color-muted)]/30">
        {selected ? (
          <div className="text-xs space-y-3">
            <div className="font-mono uppercase text-[var(--color-fg)]/60">
              {selected.event_type}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-[var(--color-fg)]/60">run_id</dt>
              <dd className="font-mono">{selected.run_id}</dd>
              <dt className="text-[var(--color-fg)]/60">seq</dt>
              <dd>{selected.sequence}</dd>
              <dt className="text-[var(--color-fg)]/60">at</dt>
              <dd>{new Date(selected.created_at).toLocaleTimeString()}</dd>
            </dl>
            <pre className="bg-[var(--color-bg)] border border-[var(--color-border)] p-2 rounded text-[10px] overflow-auto max-h-96 whitespace-pre-wrap">
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="text-xs text-[var(--color-fg)]/60">
            Click an event to inspect its payload.
          </div>
        )}
      </aside>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <SessionDetail />
    </Suspense>
  );
}
