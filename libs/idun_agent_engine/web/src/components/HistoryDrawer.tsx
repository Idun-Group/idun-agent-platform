"use client";

import { useEffect } from "react";
import { listSessions, type SessionSummary } from "@/lib/agui";

function relativeTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export default function HistorySidebar({
  sessions,
  setSessions,
  error,
  setError,
  onPick,
  onNew,
  activeThreadId,
  refreshKey,
}: {
  sessions: SessionSummary[] | null;
  setSessions: (s: SessionSummary[] | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  onPick: (id: string) => void;
  onNew: () => void;
  activeThreadId?: string;
  refreshKey: number;
}) {
  useEffect(() => {
    let cancelled = false;
    setError(null);
    listSessions()
      .then((s) => { if (!cancelled) setSessions(s); })
      .catch((e) => { if (!cancelled) setError(e.message ?? "Failed to load"); });
    return () => { cancelled = true; };
  }, [refreshKey, setSessions, setError]);

  return (
    <aside className="flex h-screen w-[300px] shrink-0 flex-col border-r border-rule bg-surface/60">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="font-serif text-[18px] font-medium text-ink">History</div>
        <button
          onClick={onNew}
          className="rounded-full border border-rule bg-surface px-3 py-1 text-[11.5px] font-medium text-muted transition hover:border-ink/20 hover:text-ink"
          title="Start a new conversation"
        >
          + New
        </button>
      </header>
      <div className="hairline mx-5" />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error && (
          <div className="mx-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[12.5px] text-rose-800">
            {error}
          </div>
        )}

        {!error && sessions === null && (
          <div className="space-y-2 px-2">
            <div className="shimmer h-12 rounded-lg" />
            <div className="shimmer h-12 rounded-lg" />
            <div className="shimmer h-12 rounded-lg" />
          </div>
        )}

        {sessions && sessions.length === 0 && !error && (
          <div className="mt-8 px-4 text-center text-[12.5px] leading-relaxed text-muted">
            No conversations yet.
          </div>
        )}

        {sessions && sessions.length > 0 && (
          <ul className="space-y-1">
            {sessions.map((s) => {
              const active = !!activeThreadId && s.threadId === activeThreadId;
              const title = s.preview || "Untitled conversation";
              return (
                <li key={s.id}>
                  <button
                    onClick={() => onPick(s.id)}
                    className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition ${
                      active ? "bg-canvas ring-1 ring-accent/30" : "hover:bg-canvas"
                    }`}
                  >
                    <span className="truncate text-[13px] font-medium text-ink">
                      {title}
                    </span>
                    <span className="text-[11px] text-muted">
                      {relativeTime(s.lastUpdateTime)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
