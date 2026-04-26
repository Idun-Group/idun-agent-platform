"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type SessionSummary, type TraceEvent, api } from "@/lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────

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

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function deriveStatus(
  s: SessionSummary,
):
  | { label: string; variant: "secondary" | "outline" | "destructive" }
  | { label: string; className: string; variant: "outline" } {
  const errors = (s as SessionSummary & { errors_count?: number }).errors_count;
  if (typeof errors === "number" && errors > 0) {
    return { label: "errors", variant: "destructive" };
  }
  const last = new Date(s.last_event_at).getTime();
  if (Number.isFinite(last) && Date.now() - last < 5 * 60_000) {
    return {
      label: "active",
      variant: "outline",
      className:
        "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    };
  }
  return { label: "completed", variant: "secondary" };
}

// ── Page ────────────────────────────────────────────────────────────────

export default function TracesPage() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SessionSummary | null>(
    null,
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["traces", "sessions", search],
    queryFn: () => api.listSessions({ limit: 50, search: search || undefined }),
  });

  const del = useMutation({
    mutationFn: api.deleteSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["traces", "sessions"] });
      toast.success("Session deleted");
    },
    onError: () => {
      toast.error("Failed to delete session");
    },
  });

  const items = data?.items ?? [];
  const selectedSession = useMemo(
    () => items.find((s) => s.id === selectedSid) ?? null,
    [items, selectedSid],
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Traces
        </h1>
        <p className="text-sm text-muted-foreground">
          Chat session history with full event timeline.
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search session ID or title…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              type="search"
            />
          </div>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.total} session{data.total === 1 ? "" : "s"}
            </span>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            aria-label="Refresh sessions"
            disabled={isFetching}
            className="ml-auto"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? "No sessions match the current filter."
                : "No sessions yet. Open the chat and send a message."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => {
                  const status = deriveStatus(s);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">
                        {s.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.title || (
                          <span className="text-muted-foreground">
                            Untitled
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {relativeTime(s.created_at)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {s.message_count}
                      </TableCell>
                      <TableCell>
                        {"className" in status ? (
                          <Badge
                            variant={status.variant}
                            className={status.className}
                          >
                            {status.label}
                          </Badge>
                        ) : (
                          <Badge variant={status.variant}>{status.label}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSid(s.id)}
                        >
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          aria-label={`Open ${s.id} in dedicated view`}
                        >
                          <Link
                            href={`/traces/session/?id=${encodeURIComponent(s.id)}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(s)}
                          className="text-destructive"
                          aria-label={`Delete ${s.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SessionSheet
        session={selectedSession}
        open={!!selectedSid}
        onOpenChange={(open) => {
          if (!open) setSelectedSid(null);
        }}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  This permanently removes session{" "}
                  <code className="font-mono">
                    {confirmDelete.id.slice(0, 12)}…
                  </code>{" "}
                  and its {confirmDelete.message_count} event
                  {confirmDelete.message_count === 1 ? "" : "s"}.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) del.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Session Sheet ───────────────────────────────────────────────────────

function SessionSheet({
  session,
  open,
  onOpenChange,
}: {
  session: SessionSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sid = session?.id ?? "";
  const [eventSearchInput, setEventSearchInput] = useState("");
  const eventSearch = useDebouncedValue(eventSearchInput, 300);
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);

  // Reset filter + selection when the sheet opens for a different session.
  useEffect(() => {
    if (!open) return;
    setEventSearchInput("");
    setSelectedEvent(null);
  }, [open, sid]);

  const { data, isLoading } = useQuery({
    queryKey: ["traces", "session", sid, "events", eventSearch],
    queryFn: () =>
      api.getSessionEvents(sid, {
        search: eventSearch || undefined,
      }),
    enabled: !!sid && open,
  });

  const events = data?.events ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="font-mono text-sm">
            {sid.slice(0, 16)}
            {sid.length > 16 ? "…" : ""}
          </SheetTitle>
          <SheetDescription>
            {session?.title || "Untitled session"}
          </SheetDescription>
        </SheetHeader>
        <div className="border-b border-border px-6 py-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search events…"
              value={eventSearchInput}
              onChange={(e) => setEventSearchInput(e.target.value)}
              type="search"
            />
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <ScrollArea className="w-[280px] border-r border-border">
            {isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : events.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {eventSearch.trim()
                  ? "No events match the filter."
                  : "No events yet."}
              </div>
            ) : (
              <ul className="flex flex-col">
                {events.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(e)}
                      className={`flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                        selectedEvent?.id === e.id ? "bg-muted" : ""
                      }`}
                    >
                      <span className="font-mono text-[11px] text-foreground/80">
                        {e.event_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        seq {e.sequence} · run {e.run_id.slice(0, 8)}
                      </span>
                    </button>
                  </li>
                ))}
                {data?.truncated && (
                  <li className="flex items-center gap-2 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Truncated — showing first 1000.
                  </li>
                )}
              </ul>
            )}
          </ScrollArea>
          <div className="flex-1 overflow-auto p-4 font-mono text-xs">
            {selectedEvent ? (
              <pre className="whitespace-pre-wrap break-words text-foreground/80">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            ) : (
              <p className="text-center text-muted-foreground">
                Select an event to inspect its payload.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
