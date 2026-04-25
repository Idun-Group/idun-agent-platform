"use client";

import { useEffect, useState } from "react";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { useChat } from "@/lib/use-chat";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { EmptyState } from "./EmptyState";
import { HeaderActions } from "./HeaderActions";

export function MinimalLayout({ threadId }: { threadId: string }) {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);
  const { messages, status, send, stop } = useChat(threadId);
  const appName = theme?.appName ?? "Idun Agent";

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)]">
        <strong>{appName}</strong>
        <div className="ml-auto">
          <HeaderActions threadId={threadId} />
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
