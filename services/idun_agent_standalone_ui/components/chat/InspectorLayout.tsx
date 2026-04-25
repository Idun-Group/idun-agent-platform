"use client";

import { useEffect, useState } from "react";
import { type ChatEvent, useChat } from "@/lib/use-chat";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { HeaderActions } from "./HeaderActions";
import { SessionList } from "./SessionList";

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
      className={`w-full text-left text-[10px] font-mono px-2 py-1 rounded flex gap-2 hover:bg-[var(--color-muted)] ${
        active ? "bg-[var(--color-muted)]" : ""
      }`}
    >
      <span className="text-[var(--color-fg)]/40 w-14 flex-shrink-0 truncate">
        {formatTime(event._at)}
      </span>
      <span className="text-[var(--color-fg)]/80 truncate">
        {String(event.type ?? "?")}
      </span>
    </button>
  );
}

export function InspectorLayout({ threadId }: { threadId: string }) {
  const { messages, events, status, send, stop } = useChat(threadId);
  const [selected, setSelected] = useState<ChatEvent | null>(null);

  // When new events stream in, auto-scroll the inspector pane to the bottom
  // unless the user picked a specific event to inspect.
  useEffect(() => {
    if (selected) return;
    const el = document.getElementById("inspector-events-list");
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, selected]);

  const detail = selected ?? events[events.length - 1] ?? null;

  return (
    <div className="grid grid-cols-[200px_1fr_280px] h-screen">
      <aside className="border-r border-[var(--color-border)] p-2 text-sm bg-[var(--color-muted)]/40 overflow-auto">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg)]/50 mb-2 px-1">
          Sessions
        </div>
        <SessionList activeId={threadId} showNew dense />
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center px-4 py-2 border-b border-[var(--color-border)]">
          <strong className="text-sm">Idun Agent</strong>
          <div className="ml-auto">
            <HeaderActions threadId={threadId} />
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
          {messages.map((m) => (
            <ChatMessage key={m.id} m={m} />
          ))}
        </div>
        <ChatInput onSend={send} streaming={status === "streaming"} onStop={stop} />
      </main>
      <aside className="border-l border-[var(--color-border)] flex flex-col bg-[var(--color-muted)]/30">
        <div className="px-3 py-2 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-fg)]/60 flex items-center gap-2">
          <span>Run events</span>
          <span className="text-[var(--color-fg)]/40">·</span>
          <span className="text-[var(--color-fg)]/50">
            {events.length}
            {events.length >= 200 ? "+" : ""}
          </span>
        </div>
        <div
          id="inspector-events-list"
          className="overflow-auto p-2 max-h-[40vh]"
        >
          {events.length === 0 ? (
            <div className="text-[10px] text-[var(--color-fg)]/40 px-2 py-1">
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
        <div className="border-t border-[var(--color-border)] flex-1 overflow-auto p-3 text-[10px] font-mono">
          {detail ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[var(--color-fg)]/80">
                  {String(detail.type ?? "?")}
                </span>
                <span className="ml-auto text-[var(--color-fg)]/50">
                  {formatTime(detail._at)}
                </span>
              </div>
              <pre className="whitespace-pre-wrap text-[var(--color-fg)]/80">
                {JSON.stringify(detail, null, 2)}
              </pre>
            </>
          ) : (
            <div className="text-[var(--color-fg)]/40">
              Click an event above to inspect it.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
