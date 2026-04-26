"use client";

import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type AgentSessionSummary, api } from "@/lib/api";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { type ChatEvent, useChat } from "@/lib/use-chat";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatInput } from "./ChatInput";
import { HeaderActions } from "./HeaderActions";
import { HistorySidebar } from "./HistorySidebar";
import { MessageView } from "./MessageView";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false });
}

function EventRow({
  event,
  onClick,
  active,
}: {
  event: ChatEvent;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full gap-2 rounded px-2 py-1 text-left font-mono text-[10px] transition hover:bg-muted ${
        active ? "bg-muted" : ""
      }`}
    >
      <span className="w-14 shrink-0 truncate text-muted-foreground/70">
        {formatTime(event._at)}
      </span>
      <span className="truncate text-foreground/80">
        {String(event.type ?? "?")}
      </span>
    </button>
  );
}

/**
 * Developer-flavored chat layout (D5 in the MVP spec).
 *
 * Editorial three-column shell on `lg+` viewports: a 260px `HistorySidebar`
 * (dense) on the left, a 1fr chat column in the middle reusing
 * `MessageView`/`ChatInput`, and a 320px right rail that surfaces the raw
 * AG-UI event ring from `useChat`.
 *
 * Responsive collapse rules:
 * - `<md`: 1 column = chat only. Sessions move into a left `<Sheet>` opened
 *   via a hamburger pill in the header. Right rail is hidden.
 * - `md`: 2 columns = sessions + chat. Right rail still hidden.
 * - `lg+`: full 3-column grid.
 *
 * The right panel is the only place in the redesigned chat UI that exposes
 * the underlying `events` array — auto-scroll keeps the latest event visible
 * unless the user has clicked into a specific event for inspection. The
 * detail panel below renders the selected (or most recent) event as JSON.
 */
export function InspectorLayout({ threadId }: { threadId: string }) {
  const router = useRouter();
  const { messages, events, send, stop, status } = useChat(threadId);
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);

  // Capability discovery — non-blocking. Failures fall back to "history is
  // available" because the listing query itself surfaces its own errors.
  const { data: caps } = useQuery({
    queryKey: ["agent-capabilities"],
    queryFn: () => api.getAgentCapabilities().catch(() => null),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const canListHistory = caps?.history?.canList ?? true;

  const [selected, setSelected] = useState<ChatEvent | null>(null);

  // Auto-scroll the inspector ring as new events stream in, unless the user
  // has pinned a specific event for inspection.
  useEffect(() => {
    if (selected) return;
    const el = document.getElementById("inspector-events-list");
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, selected]);

  const detail = selected ?? events[events.length - 1] ?? null;
  const appName = theme?.appName ?? "Idun Agent";

  const newConversation = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    router.push(`/?session=${id}`);
  };
  const pickSession = (s: AgentSessionSummary) => {
    const routeId = s.threadId ?? s.id;
    router.push(`/?session=${encodeURIComponent(routeId)}`);
  };

  return (
    <div className="grid h-screen grid-cols-1 bg-background text-foreground md:grid-cols-[260px_1fr] lg:grid-cols-[260px_1fr_320px]">
      <div className="hidden md:block">
        <HistorySidebar
          activeId={threadId}
          onPick={pickSession}
          onNew={newConversation}
          dense
          canListHistory={canListHistory}
        />
      </div>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[260px] gap-0 p-0 sm:max-w-[260px]"
        >
          <SheetTitle className="sr-only">Conversation history</SheetTitle>
          <HistorySidebar
            activeId={threadId}
            onPick={(s) => {
              setDrawerOpen(false);
              pickSession(s);
            }}
            onNew={() => {
              setDrawerOpen(false);
              newConversation();
            }}
            dense
            canListHistory={canListHistory}
          />
        </SheetContent>
      </Sheet>
      <main className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open history"
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
          <strong className="text-sm font-medium">{appName}</strong>
          <div className="ml-auto">
            <HeaderActions
              threadId={threadId}
              onNewSession={newConversation}
            />
          </div>
        </div>
        <div className="scroll-fade flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {messages.map((m) => (
              <MessageView key={m.id} m={m} />
            ))}
          </div>
        </div>
        <div className="border-t border-border bg-card/40 px-4 py-3">
          <ChatInput
            onSend={send}
            streaming={status === "streaming"}
            onStop={stop}
          />
        </div>
      </main>
      <aside className="hidden flex-col overflow-hidden border-l border-border bg-card/30 lg:flex">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Run events</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="font-mono normal-case tracking-normal text-muted-foreground/70">
            {events.length}
            {events.length >= 200 ? "+" : ""}
          </span>
        </div>
        <div
          id="inspector-events-list"
          className="max-h-[40vh] overflow-auto p-2"
        >
          {events.length === 0 ? (
            <div className="px-2 py-1 text-[10px] text-muted-foreground/60">
              No events yet. Send a message to see the AG-UI stream.
            </div>
          ) : (
            <div className="space-y-px">
              {events.map((e) => (
                <EventRow
                  key={e._id}
                  event={e}
                  onClick={() => setSelected(e)}
                  active={selected?._id === e._id}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto border-t border-border p-3 font-mono text-[10px]">
          {detail ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-foreground/80">
                  {String(detail.type ?? "?")}
                </span>
                <span className="ml-auto text-muted-foreground/60">
                  {formatTime(detail._at)}
                </span>
              </div>
              <pre className="whitespace-pre-wrap text-foreground/80">
                {JSON.stringify(detail, null, 2)}
              </pre>
            </>
          ) : (
            <div className="text-muted-foreground/50">
              Click an event above to inspect it.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
