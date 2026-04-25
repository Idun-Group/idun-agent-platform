"use client";

import { useEffect, useState } from "react";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { useChat } from "@/lib/use-chat";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { EmptyState } from "./EmptyState";
import { HeaderActions } from "./HeaderActions";

export function BrandedLayout({ threadId }: { threadId: string }) {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);
  const { messages, status, send, stop } = useChat(threadId);

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-3 px-4 py-3 text-white bg-[linear-gradient(90deg,var(--color-primary),var(--color-accent))]">
        <div className="h-6 w-6 rounded bg-white/20 flex items-center justify-center overflow-hidden">
          {theme?.logo.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logo.imageUrl}
              alt="logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[10px] font-semibold">
              {theme?.logo.text ?? "IA"}
            </span>
          )}
        </div>
        <strong>{theme?.appName ?? "Idun Agent"}</strong>
        <div className="ml-auto">
          <HeaderActions threadId={threadId} tone="onPrimary" />
        </div>
      </header>
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
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
