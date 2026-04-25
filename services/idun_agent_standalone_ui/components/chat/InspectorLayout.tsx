"use client";

import { useChat } from "@/lib/use-chat";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { HeaderActions } from "./HeaderActions";

export function InspectorLayout({ threadId }: { threadId: string }) {
  const { messages, status, send, stop } = useChat(threadId);
  return (
    <div className="grid grid-cols-[180px_1fr_220px] h-screen">
      <aside className="border-r border-[var(--color-border)] p-3 text-sm bg-[var(--color-muted)]/40">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg)]/50 mb-2">
          Sessions
        </div>
        <button
          type="button"
          className="w-full text-left px-2 py-1 rounded bg-[var(--color-muted)] text-sm"
        >
          + New chat
        </button>
        <div className="mt-2 text-xs text-[var(--color-fg)]/50 px-2">
          Session list — coming with TanStack Query wiring
        </div>
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
      <aside className="border-l border-[var(--color-border)] p-3 text-xs font-mono bg-[var(--color-muted)]/40">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg)]/50 mb-2">
          Run events
        </div>
        <div className="text-[var(--color-fg)]/50">
          Live event inspector — wires up via /admin/api/v1/traces in next iteration.
        </div>
      </aside>
    </div>
  );
}
