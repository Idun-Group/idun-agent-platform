"use client";

import { useEffect, useState } from "react";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { useChat } from "@/lib/use-chat";
import { ChatInput } from "./ChatInput";
import { MessageView } from "./MessageView";

/**
 * Embedded chat layout (D5 in the MVP spec).
 *
 * Single column, no sidebar, no halo around the welcome state, and a
 * pared-down header that only shows the logo+appName — appropriate for
 * embed contexts where the host page handles "New conversation" and
 * sign-out concerns. Reuses the same building blocks as `BrandedLayout`
 * (`MessageView`, `ChatInput`) so theme tokens and behaviour stay aligned.
 */
export function MinimalLayout({ threadId }: { threadId: string }) {
  const { messages, send, stop, status } = useChat(threadId);
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);
  const empty = messages.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[720px] items-center px-6 py-3">
          <Logo theme={theme} />
        </div>
      </header>
      {empty ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-2xl space-y-6 text-center">
            <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.02em] text-foreground">
              {theme?.greeting ?? "How can I help?"}
            </h1>
            <ChatInput
              onSend={send}
              streaming={status === "streaming"}
              onStop={stop}
              autoFocus
            />
          </div>
        </div>
      ) : (
        <>
          <div className="scroll-fade flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[720px] space-y-6 px-6 py-6">
              {messages.map((m) => (
                <MessageView key={m.id} m={m} />
              ))}
            </div>
          </div>
          <div className="bg-gradient-to-t from-background via-background/90 to-background/0 pt-3 pb-5">
            <div className="mx-auto max-w-[720px] px-6">
              <ChatInput
                onSend={send}
                streaming={status === "streaming"}
                onStop={stop}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Logo mark used in the minimal header. Renders the theme's uploaded
 * image when available, else a smaller (h-7) ink-on-cream initials chip
 * paired with the app name. Sized down vs. `BrandedLayout` to suit the
 * tighter embed header.
 */
function Logo({ theme }: { theme: ThemeConfig | null }) {
  if (!theme) return null;
  const text = theme.logo.text || "IA";
  if (theme.logo.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={theme.logo.imageUrl}
        alt={theme.appName}
        className="h-7 object-contain"
      />
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground font-serif text-xs font-medium text-background">
        {text.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-[14px] font-medium text-foreground">
        {theme.appName}
      </span>
    </div>
  );
}
