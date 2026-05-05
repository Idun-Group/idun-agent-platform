"use client";

import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type AgentSessionSummary, api } from "@/lib/api";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { ChatActionsContext, useChat } from "@/lib/use-chat";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
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
 * On viewports below `md` (768px) the inline sidebar is hidden and a
 * hamburger button in the header opens it inside a `<Sheet side="left">`
 * drawer. The hamburger is also surfaced in the welcome state so users can
 * reach prior conversations before sending their first message.
 *
 * Owns navigation: the layout reads `threadId` from props but uses
 * `useRouter` to push `/?session=<uuid>` whenever the user picks a session
 * or starts a new conversation. The page-level component re-derives the
 * thread id from `?session=…` so route changes are reflected in the chat.
 */
export function BrandedLayout({ threadId }: { threadId: string }) {
  const router = useRouter();
  const chat = useChat(threadId);
  const { messages, send, stop, status, sendAction } = chat;
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);
  const empty = messages.length === 0;
  // Computed once at the pane level so every MessageView/Surface on this
  // pane shares the same "this is the live message" signal.
  const latestAssistantMessageId = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant")?.id,
    [messages],
  );
  const actionsValue = useMemo(() => ({ sendAction }), [sendAction]);

  // Capability discovery — non-blocking. If the request fails (older engine,
  // network blip), we treat history as available; the listing query will
  // surface its own error state if the endpoint is missing.
  const { data: caps } = useQuery({
    queryKey: ["agent-capabilities"],
    queryFn: () => api.getAgentCapabilities().catch(() => null),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const canListHistory = caps?.history?.canList ?? true;

  const newConversation = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    router.push(`/?session=${id}`);
  };
  const pickSession = (s: AgentSessionSummary) => {
    // Routes are keyed on the AG-UI thread id (LangGraph: same as s.id; ADK:
    // s.threadId is set explicitly). Fall back to s.id when the adapter
    // doesn't populate threadId so the click still navigates somewhere.
    const routeId = s.threadId ?? s.id;
    router.push(`/?session=${encodeURIComponent(routeId)}`);
  };

  return (
    <ChatActionsContext.Provider value={actionsValue}>
      <div className="flex h-screen bg-background text-foreground">
        <div className="hidden md:block">
        <HistorySidebar
          activeId={threadId}
          onPick={pickSession}
          onNew={newConversation}
          canListHistory={canListHistory}
        />
      </div>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[300px] gap-0 p-0 sm:max-w-[300px]"
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
            canListHistory={canListHistory}
          />
        </SheetContent>
      </Sheet>
      <div className="relative flex min-w-0 flex-1 flex-col">
        {empty ? (
          <>
            <div className="absolute top-4 left-4 z-20 md:hidden">
              <HamburgerButton onClick={() => setDrawerOpen(true)} />
            </div>
            <WelcomeHero
              onSend={send}
              streaming={status === "streaming"}
              onStop={stop}
            />
          </>
        ) : (
          <>
            <header className="relative z-10">
              <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3 px-6 pt-6 pb-4">
                <div className="flex items-center gap-3">
                  <HamburgerButton onClick={() => setDrawerOpen(true)} />
                  <Logo theme={theme} />
                </div>
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
                  <MessageView
                    key={m.id}
                    m={m}
                    isInteractive={
                      m.role === "assistant" &&
                      m.id === latestAssistantMessageId &&
                      status === "idle"
                    }
                  />
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
    </ChatActionsContext.Provider>
  );
}

/**
 * Editorial pill-style hamburger button. Only visible below the `md`
 * breakpoint where the inline `HistorySidebar` is hidden — opens the
 * drawer Sheet so users can still reach session history.
 */
function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open history"
      className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
    >
      <Menu className="h-4 w-4" />
    </button>
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
