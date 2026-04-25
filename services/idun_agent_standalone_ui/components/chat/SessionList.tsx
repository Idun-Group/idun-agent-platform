"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { type SessionSummary, api } from "@/lib/api";

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

type Props = {
  /** Currently selected thread/session id; rendered with an active highlight. */
  activeId?: string;
  /** When provided, clicking a session calls onSelect(id) instead of pushing
   * the chat route. Used by the traces/[sessionId] sidebar. */
  onSelect?: (s: SessionSummary) => void;
  /** When true, items link to /traces/session/?id=… instead of /?session=… */
  toTraces?: boolean;
  /** Render the "+ New chat" item — only meaningful in chat layouts. */
  showNew?: boolean;
  /** Compact density (used inside the inspector left rail). */
  dense?: boolean;
  /** Override fetch params; defaults to limit=10. */
  limit?: number;
};

export function SessionList({
  activeId,
  onSelect,
  toTraces = false,
  showNew = false,
  dense = false,
  limit = 10,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const { data } = useQuery({
    queryKey: ["sessions", "list", limit],
    queryFn: () => api.listSessions({ limit }).catch(() => null),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  const newSession = () => {
    const id = crypto.randomUUID();
    const qp = new URLSearchParams(params.toString());
    qp.set("session", id);
    router.push(`/?${qp.toString()}`);
  };

  const itemClass = (active: boolean) =>
    [
      "w-full text-left rounded text-xs flex items-center gap-2 hover:bg-[var(--color-muted)]",
      dense ? "px-2 py-1" : "px-2 py-1.5",
      active ? "bg-[var(--color-muted)]" : "",
    ].join(" ");

  return (
    <div className="flex flex-col gap-1">
      {showNew && (
        <button
          type="button"
          onClick={newSession}
          className={`${itemClass(false)} text-[var(--color-fg)]/80`}
        >
          <Plus size={12} />
          New chat
        </button>
      )}
      {items.length === 0 ? (
        <div className="px-2 py-2 text-[10px] text-[var(--color-fg)]/50">
          No sessions yet.
        </div>
      ) : (
        <ul>
          {items.map((s) => {
            const active = activeId === s.id;
            const inner = (
              <>
                <span className="font-mono w-16 truncate text-[var(--color-fg)]/80">
                  {s.id.slice(0, 8)}
                </span>
                <span className="flex-1 truncate text-[var(--color-fg)]">
                  {s.title || "(untitled)"}
                </span>
                <span className="text-[10px] text-[var(--color-fg)]/50">
                  {relTime(s.last_event_at)}
                </span>
              </>
            );
            if (onSelect) {
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(s)}
                    className={itemClass(active)}
                  >
                    {inner}
                  </button>
                </li>
              );
            }
            const href = toTraces
              ? `/traces/session/?id=${encodeURIComponent(s.id)}`
              : `/?session=${encodeURIComponent(s.id)}`;
            return (
              <li key={s.id}>
                <Link href={href} className={itemClass(active)}>
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
