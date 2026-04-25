"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { api } from "@/lib/api";

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

export function SessionSwitcher({ threadId }: { threadId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["sessions", "switcher"],
    // Best-effort; the chat UI is public and the call may 401 in password mode.
    // The switcher silently degrades to "no list" on auth errors.
    queryFn: () => api.listSessions({ limit: 10 }).catch(() => null),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    enabled: open, // only fetch when the menu opens
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const newSession = () => {
    const id = crypto.randomUUID();
    const qp = new URLSearchParams(params.toString());
    qp.set("session", id);
    router.push(`/?${qp.toString()}`);
    setOpen(false);
  };

  const goto = (id: string) => {
    const qp = new URLSearchParams(params.toString());
    qp.set("session", id);
    router.push(`/?${qp.toString()}`);
    setOpen(false);
  };

  const items = data?.items ?? [];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs opacity-80 hover:opacity-100 px-2 py-1 rounded hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="font-mono">{threadId.slice(0, 8)}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-72 z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] shadow-lg p-1"
        >
          <button
            type="button"
            onClick={newSession}
            className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 hover:bg-[var(--color-muted)]"
          >
            <Plus size={12} />
            New session
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          {items.length === 0 ? (
            <div className="px-2 py-2 text-xs text-[var(--color-fg)]/60">
              No previous sessions.
            </div>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {items.map((s) => {
                const active = s.id === threadId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goto(s.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 hover:bg-[var(--color-muted)] ${
                        active ? "bg-[var(--color-muted)]" : ""
                      }`}
                    >
                      <span className="font-mono w-20 truncate text-[var(--color-fg)]/80">
                        {s.id.slice(0, 8)}
                      </span>
                      <span className="flex-1 truncate text-[var(--color-fg)]">
                        {s.title || "(untitled)"}
                      </span>
                      <span className="text-[10px] text-[var(--color-fg)]/50">
                        {relTime(s.last_event_at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
