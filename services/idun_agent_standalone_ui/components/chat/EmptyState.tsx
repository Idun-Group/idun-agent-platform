"use client";

import { useEffect, useState } from "react";
import { type ThemeConfig, getRuntimeConfig } from "@/lib/runtime-config";

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    setTheme(getRuntimeConfig().theme);
  }, []);
  if (!theme) return null;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="h-12 w-12 rounded-lg bg-[var(--color-primary)] grid place-items-center text-white font-bold">
        {theme.logo.text.slice(0, 2).toUpperCase()}
      </div>
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">
        {theme.appName}
      </h1>
      {theme.greeting && (
        <p className="text-sm text-[var(--color-fg)]/70">{theme.greeting}</p>
      )}
      {theme.starterPrompts.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {theme.starterPrompts.slice(0, 4).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)]"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
