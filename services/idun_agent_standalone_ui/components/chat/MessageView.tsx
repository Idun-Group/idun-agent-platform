"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/agui";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { ReasoningPanel } from "./ReasoningPanel";

type Props = {
  m: Message;
};

/**
 * Renders a single chat message. User messages get the dark ink bubble
 * (right-aligned). Assistant messages get an avatar + content column with
 * an opener, the ReasoningPanel, and the streaming markdown body.
 *
 * The avatar is rendered inline (32×32 circle) showing either the theme's
 * logo image or its initials text — mirrors the `IdunMark` shape used
 * elsewhere without introducing a separate primitive.
 */
export function MessageView({ m }: Props) {
  // Theme is read on mount (mirrors WelcomeHero / InspectorLayout) so the
  // static export still renders before /runtime-config.js applies.
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md bg-foreground px-4 py-2.5 text-[15.5px] leading-snug text-background shadow-sm">
          {m.text}
        </div>
      </div>
    );
  }

  const logoText = theme?.logo.text ?? "IA";
  const logoImage = theme?.logo.imageUrl;

  const hasAnything =
    Boolean(m.opener) ||
    Boolean(m.plan) ||
    Boolean(m.text) ||
    Boolean(m.thoughts) ||
    (m.toolCalls && m.toolCalls.length > 0);
  const waiting = m.streaming === true && !hasAnything;

  return (
    <div className="flex w-full gap-3.5">
      <div className="shrink-0 pt-0.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-border">
          {logoImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoImage}
              alt={logoText}
              className="h-5 w-5 object-contain"
            />
          ) : (
            <span className="text-xs font-semibold text-foreground">
              {logoText.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-3.5">
        {waiting && (
          <div className="flex items-center gap-2 py-2" aria-label="Thinking">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}

        {m.opener && (
          <div className="text-[16px] leading-relaxed text-foreground">
            {m.opener}
          </div>
        )}

        <ReasoningPanel
          plan={m.plan}
          thoughts={m.thoughts}
          thinking={m.streaming === true && m.currentStep === "thinking"}
          toolCalls={m.toolCalls ?? []}
          streaming={m.streaming}
        />

        {m.text && (
          <div className="prose-chat max-w-none text-[16px] leading-[1.65] text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
            {m.streaming && (
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-foreground/60 align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
