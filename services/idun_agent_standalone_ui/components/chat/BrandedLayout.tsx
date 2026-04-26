"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type SessionSummary } from "@/lib/api";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { useChat } from "@/lib/use-chat";
import { ChatInput } from "./ChatInput";
import { HeaderActions } from "./HeaderActions";
import { HistorySidebar } from "./HistorySidebar";
import { MessageView } from "./MessageView";
import { WelcomeHero } from "./WelcomeHero";

/**
 * Default chat layout for the standalone deployment.
 *
 * Two-column editorial shell: a 300px `HistorySidebar` on the left and a
 * 720px chat column on the right. The empty state surfaces `WelcomeHero`
 * centered on the canvas; once the conversation has at least one message,
 * the column splits into a logo+actions header, a scroll-faded thread, and
 * a gradient-faded composer dock.
 *
 * Owns navigation: the layout reads `threadId` from props but uses
 * `useRouter` to push `/?session=<uuid>` whenever the user picks a session
 * or starts a new conversation. The page-level component re-derives the
 * thread id from `?session=…` so route changes are reflected in the chat.
 */
export function BrandedLayout({ threadId }: { threadId: string }) {
  const router = useRouter();
  const { messages, send, stop, status } = useChat(threadId);
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);
  const empty = messages.length === 0;

  const newConversation = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    router.push(`/?session=${id}`);
  };
  const pickSession = (s: SessionSummary) =>
    router.push(`/?session=${encodeURIComponent(s.id)}`);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <HistorySidebar
        activeId={threadId}
        onPick={pickSession}
        onNew={newConversation}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {empty ? (
          <WelcomeHero
            onSend={send}
            streaming={status === "streaming"}
            onStop={stop}
          />
        ) : (
          <>
            <header className="relative z-10">
              <div className="mx-auto flex max-w-[720px] items-center justify-between px-6 pt-6 pb-4">
                <Logo theme={theme} />
                <HeaderActions
                  threadId={threadId}
                  onNewSession={newConversation}
                />
              </div>
              <div className="mx-auto max-w-[720px] px-6">
                <div className="hairline" />
              </div>
            </header>
            <div className="scroll-fade relative z-10 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[720px] space-y-6 px-6 py-8">
                {messages.map((m) => (
                  <MessageView key={m.id} m={m} />
                ))}
              </div>
            </div>
            <div className="relative z-10 bg-gradient-to-t from-background via-background/90 to-background/0 pt-3 pb-5">
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
    </div>
  );
}

/**
 * Inline logo mark used in the active-state header. Renders the theme's
 * uploaded image when available, else a circular ink-on-cream initials chip
 * paired with the app name in serif type. Mirrors the IdunMark+wordmark
 * pairing used in the spec without introducing a separate primitive.
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
        className="h-9 object-contain"
      />
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground font-serif text-sm font-medium text-background">
        {text.slice(0, 2).toUpperCase()}
      </span>
      <span className="font-serif text-[16px] text-foreground">
        {theme.appName}
      </span>
    </div>
  );
}
