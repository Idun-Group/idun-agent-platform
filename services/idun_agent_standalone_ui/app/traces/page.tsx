"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export default function TracesIndex() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["traces", "sessions"],
    queryFn: () => api.listSessions(),
  });
  const del = useMutation({
    mutationFn: api.deleteSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["traces", "sessions"] });
      toast.success("Deleted");
    },
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
      </header>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-sm">Loading…</div>
        ) : !data?.items.length ? (
          <div className="p-6 text-sm text-[var(--color-fg)]/60">
            No sessions yet. Open the chat at <code>/</code> and send a message.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--color-fg)]/60 sticky top-0 bg-[var(--color-bg)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="p-3">Session</th>
                <th className="p-3">Title</th>
                <th className="p-3">Events</th>
                <th className="p-3">Last event</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-muted)]/40"
                >
                  <td className="p-3 font-mono text-xs">
                    <Link
                      href={`/traces/session/?id=${encodeURIComponent(s.id)}`}
                      className="underline underline-offset-2"
                    >
                      {s.id.slice(0, 12)}…
                    </Link>
                  </td>
                  <td className="p-3">{s.title ?? "(untitled)"}</td>
                  <td className="p-3">{s.message_count}</td>
                  <td className="p-3">
                    {new Date(s.last_event_at).toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete session?")) del.mutate(s.id);
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
