"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { type AgentSessionSummary, ApiError, api } from "@/lib/api";
import {
  fetchSsoInfo,
  signOut as ssoSignOut,
  type SsoInfo,
} from "@/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  /** Currently selected session id; rendered with an active highlight. */
  activeId?: string;
  /** Called when the user picks an existing session row. */
  onPick: (s: AgentSessionSummary) => void;
  /** Called when the user clicks "+ New". */
  onNew: () => void;
  /** Compact density, used by InspectorLayout's left rail. */
  dense?: boolean;
  /**
   * When false, the engine adapter's memory backend doesn't expose a
   * listing API. We replace the conversation list with an inline alert
   * but keep the rail (and the "+ New" pill) so users can still start a
   * fresh thread.
   */
  canListHistory?: boolean;
};

/**
 * Format an epoch-seconds timestamp as a short relative-time badge:
 * `just now`, `5m ago`, `3h ago`, `2d ago`, or a locale date for older items.
 *
 * Engine ``SessionSummary.lastUpdateTime`` is epoch *seconds* (per the
 * Pydantic schema), so we multiply by 1000 before subtracting from
 * ``Date.now()`` (epoch ms).
 */
function relativeTimeFromSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "";
  }
  const ms = seconds * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
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
 * Editorial chrome: serif "History" header, "+ New" pill, shadcn
 * Skeleton placeholders during fetch, relative-time badges,
 * terracotta-tinted active row.
 *
 * Pulls from the engine-backed ``GET /agent/sessions`` endpoint
 * (``api.listAgentSessions``). When the active memory backend doesn't
 * support listing (``canListHistory === false``), the list area shows
 * an inline alert instead — the rail and "+ New" pill stay reachable
 * so users can still start fresh threads.
 */
export function HistorySidebar({
  activeId,
  onPick,
  onNew,
  dense = false,
  canListHistory = true,
}: Props) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["agent-sessions", "history-sidebar"],
    queryFn: () => api.listAgentSessions(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // When the adapter declares no listing support, skip the network round-trip
    // entirely. The rail will render the "history not available" alert below.
    enabled: canListHistory,
  });

  const items = data ?? [];

  const [ssoInfo, setSsoInfo] = useState<SsoInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchSsoInfo()
      .then((info) => {
        if (!cancelled) setSsoInfo(info);
      })
      .catch(() => {
        if (!cancelled) setSsoInfo({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await ssoSignOut().catch(() => {});
    if (typeof window !== "undefined") window.location.replace("/");
  };

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
        {!canListHistory ? (
          <Alert className="mx-1">
            <AlertTitle>History not available</AlertTitle>
            <AlertDescription>
              The active memory backend doesn't expose a listing API. New
              conversations still work.
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
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
              // Routes use the AG-UI thread id; for LangGraph this equals
              // ``s.id`` (thread_id), for ADK ``threadId`` is set explicitly
              // and ``s.id`` carries the ADK session_id. Match either so
              // the active highlight survives both adapter shapes.
              const routeId = s.threadId ?? s.id;
              const active = activeId === routeId || activeId === s.id;
              const title = s.preview?.trim() || "Untitled conversation";
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
                      {relativeTimeFromSeconds(s.lastUpdateTime)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {ssoInfo?.enabled ? (
        <div className="border-t border-border px-3 py-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition hover:bg-card hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </aside>
  );
}
