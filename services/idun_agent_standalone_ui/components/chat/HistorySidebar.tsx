"use client";

import { useQuery } from "@tanstack/react-query";
import { type SessionSummary, ApiError, api } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  /** Currently selected session id; rendered with an active highlight. */
  activeId?: string;
  /** Called when the user picks an existing session row. */
  onPick: (s: SessionSummary) => void;
  /** Called when the user clicks "+ New". */
  onNew: () => void;
  /** Compact density, used by InspectorLayout's left rail. */
  dense?: boolean;
};

/**
 * Format an ISO timestamp as a short relative-time badge:
 * `just now`, `5m ago`, `3h ago`, `2d ago`, or a locale date for older items.
 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return `Could not load conversations (HTTP ${err.status}).`;
  }
  if (err instanceof Error) return err.message;
  return "Could not load conversations.";
}

/**
 * Left rail (300px) listing recent chat sessions.
 *
 * Editorial chrome: serif "History" header, "+ New" pill, shimmer
 * skeletons during fetch, relative-time badges, terracotta-tinted
 * active row.
 */
export function HistorySidebar({ activeId, onPick, onNew, dense = false }: Props) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sessions", "history-sidebar"],
    queryFn: () => api.listSessions({ limit: 30 }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const items = data?.items ?? [];

  return (
    <aside className="flex h-screen w-[300px] shrink-0 flex-col border-r border-border bg-card/60">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="font-serif text-[18px] font-medium text-foreground">
          History
        </div>
        <button
          type="button"
          onClick={onNew}
          className="rounded-full border border-border bg-card px-3 py-1 text-[11.5px] font-medium text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
        >
          + New
        </button>
      </header>
      <div className="hairline mx-5" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="flex flex-col gap-2 px-1">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : isError ? (
          <Alert variant="destructive" className="mx-1">
            <AlertTitle>Couldn't load history</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : items.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center text-[13px] text-muted-foreground">
            No conversations yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((s) => {
              const active = activeId === s.id;
              const title = s.title?.trim() || "Untitled conversation";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick(s)}
                    className={cn(
                      "group flex w-full flex-col items-start gap-1 rounded-lg border border-transparent text-left transition hover:bg-card",
                      dense ? "px-2 py-1.5" : "px-3 py-2",
                      active && "bg-card ring-1 ring-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "w-full truncate font-medium text-foreground",
                        dense ? "text-[12.5px]" : "text-[13.5px]",
                      )}
                    >
                      {title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {relativeTime(s.last_event_at)}
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
