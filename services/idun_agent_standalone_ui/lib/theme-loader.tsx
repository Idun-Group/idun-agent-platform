"use client";

import { useEffect } from "react";
import { getRuntimeConfig } from "@/lib/runtime-config";

/** Apply CSS custom properties from the runtime theme on first paint. */
export function ThemeLoader() {
  useEffect(() => {
    const cfg = getRuntimeConfig();
    const scheme =
      cfg.theme.defaultColorScheme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : cfg.theme.defaultColorScheme;
    const colors = cfg.theme.colors[scheme];
    const root = document.documentElement;
    if (scheme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    Object.entries(colors).forEach(([k, v]) => {
      const cssKey =
        k === "background"
          ? "--color-bg"
          : k === "foreground"
            ? "--color-fg"
            : `--color-${k}`;
      root.style.setProperty(cssKey, v);
    });
    root.style.setProperty("--radius", `${cfg.theme.radius}rem`);
    document.title = cfg.theme.appName || "Idun Agent";
  }, []);
  return null;
}
