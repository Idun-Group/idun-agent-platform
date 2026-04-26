"use client";

import { useEffect, useState } from "react";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";
import { ChatInput } from "./ChatInput";

type Props = {
  onSend: (text: string) => void;
  streaming?: boolean;
  onStop?: () => void;
};

/**
 * Empty-state hero shown before the first message.
 *
 * Centered logo + serif headline + greeting + ChatInput pill. The decorative
 * `.halo` glow sits behind the content as an absolute sibling, and the
 * children of `.welcome-reveal` cascade in via the staggered `riseIn`
 * keyframes defined in `globals.css`.
 *
 * The theme is read on mount (mirrors `InspectorLayout`) so the static
 * export still renders without `window.__IDUN_CONFIG__`.
 */
export function WelcomeHero({ onSend, streaming = false, onStop }: Props) {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);

  const appName = theme?.appName ?? "Idun Agent";
  const greeting = theme?.greeting ?? "";
  const logoText = theme?.logo.text ?? "IA";
  const logoImage = theme?.logo.imageUrl;
  const starterPrompts = theme?.starterPrompts ?? [];

  return (
    <div className="relative z-10 flex flex-1 items-center justify-center px-6">
      <div className="halo" />
      <div className="welcome-reveal relative w-full max-w-2xl text-center">
        <div className="mb-12 flex items-center justify-center">
          {logoImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoImage} className="h-24" alt={logoText} />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
              {logoText.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <h1 className="mb-6 font-serif text-[68px] leading-[1.02] font-medium tracking-[-0.03em] text-foreground">
          Hello, <span className="italic text-accent">welcome</span>
          <br />
          to your {appName} UI
        </h1>
        {greeting && (
          <p className="mx-auto mb-12 max-w-lg text-[18px] leading-relaxed text-muted-foreground">
            {greeting}
          </p>
        )}
        <div className="mx-auto max-w-xl">
          <ChatInput
            onSend={onSend}
            streaming={streaming}
            onStop={onStop ?? (() => {})}
          />
          {starterPrompts.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {starterPrompts.slice(0, 4).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSend(prompt)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
