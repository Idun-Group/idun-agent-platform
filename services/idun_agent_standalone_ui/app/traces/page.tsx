"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { type SessionSummary, api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function formatDuration(s: SessionSummary): string {
  const start = new Date(s.created_at).getTime();
  const end = new Date(s.last_event_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "—";
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

export default function TracesIndex() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["traces", "sessions", search],
    queryFn: () => api.listSessions({ limit: 50, search: search || undefined }),
  });

  const del = useMutation({
    mutationFn: api.deleteSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["traces", "sessions"] });
      toast.success("Deleted");
    },
  });

  const items = (data?.items ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      (s.title ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-[var(--color-border)] flex items-center gap-3">
        <h2 className="font-semibold">Traces</h2>
        {data && (
          <span className="text-xs text-[var(--color-fg)]/60">
            {data.total} session{data.total === 1 ? "" : "s"}
          </span>
        )}
        <div className="ml-auto w-64">
          <Input
            type="search"
            placeholder="Search by id or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-sm">Loading…</div>
        ) : !items.length ? (
          <div className="p-6 text-sm text-[var(--color-fg)]/60">
            {search.trim()
              ? "No sessions match the current filter."
              : "No sessions yet. Open the chat at "}
            {!search.trim() && <code>/</code>}
            {!search.trim() && " and send a message."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--color-fg)]/60 sticky top-0 bg-[var(--color-bg)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="p-3">Session</th>
                <th className="p-3">Title</th>
                <th className="p-3">Events</th>
                <th className="p-3">Created</th>
                <th className="p-3">Last event</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Errors</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <SessionRow key={s.id} session={s} onDelete={() => del.mutate(s.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  onDelete,
}: {
  session: SessionSummary;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title ?? "");
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (next: string) =>
      api.patchSession(session.id, { title: next || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["traces", "sessions"] });
      setEditing(false);
      toast.success("Updated");
    },
    onError: () => {
      toast.error("Title editing requires backend update (A8/B5).");
      setEditing(false);
    },
  });

  const errorsCount =
    typeof (session as SessionSummary & { errors_count?: number }).errors_count ===
    "number"
      ? (session as SessionSummary & { errors_count?: number }).errors_count
      : null;

  return (
    <tr className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-muted)]/40">
      <td className="p-3 font-mono text-xs">
        <Link
          href={`/traces/session/?id=${encodeURIComponent(session.id)}`}
          className="underline underline-offset-2"
        >
          {session.id.slice(0, 12)}…
        </Link>
      </td>
      <td className="p-3">
        {editing ? (
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => save.mutate(title)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save.mutate(title);
              if (e.key === "Escape") {
                setTitle(session.title ?? "");
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="text-left underline-offset-2 hover:underline"
            onClick={() => setEditing(true)}
            aria-label="Edit title"
          >
            {session.title ?? <span className="opacity-50">(untitled)</span>}
          </button>
        )}
      </td>
      <td className="p-3">{session.message_count}</td>
      <td className="p-3 text-xs">
        {new Date(session.created_at).toLocaleString()}
      </td>
      <td className="p-3 text-xs">
        {new Date(session.last_event_at).toLocaleString()}
      </td>
      <td className="p-3">{formatDuration(session)}</td>
      <td className="p-3">
        {errorsCount === null ? (
          <span className="opacity-40">—</span>
        ) : errorsCount === 0 ? (
          <span className="text-emerald-600">0</span>
        ) : (
          <span className="text-red-600">{errorsCount}</span>
        )}
      </td>
      <td className="p-3 text-right">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm("Delete session?")) onDelete();
          }}
        >
          Delete
        </Button>
      </td>
    </tr>
  );
}
