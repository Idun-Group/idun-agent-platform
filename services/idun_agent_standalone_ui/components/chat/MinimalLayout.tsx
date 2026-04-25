"use client";

import { useChat } from "@/lib/use-chat";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { EmptyState } from "./EmptyState";
import { SessionSwitcher } from "./SessionSwitcher";

export function MinimalLayout({ threadId }: { threadId: string }) {
  const { messages, status, send, stop } = useChat(threadId);
  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)]">
        <strong>Idun Agent</strong>
        <div className="ml-auto">
          <SessionSwitcher threadId={threadId} />
        </div>
      </header>
      <div className="flex-1 flex flex-col gap-3 p-6 overflow-auto">
        {messages.length === 0 ? (
          <EmptyState onPick={send} />
        ) : (
          messages.map((m) => <ChatMessage key={m.id} m={m} />)
        )}
      </div>
      <ChatInput onSend={send} streaming={status === "streaming"} onStop={stop} />
    </div>
  );
}
