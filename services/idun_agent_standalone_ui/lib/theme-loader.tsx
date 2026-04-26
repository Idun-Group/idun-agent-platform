"use client";

import { useEffect } from "react";
import { type ThemeColors, getRuntimeConfig } from "@/lib/runtime-config";

const STYLE_TAG_ID = "idun-theme-runtime";

const COLOR_VAR_NAMES: Record<keyof ThemeColors, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
};

function buildColorBlock(scope: string, colors: ThemeColors): string {
  const lines: string[] = [];
  for (const key of Object.keys(COLOR_VAR_NAMES) as (keyof ThemeColors)[]) {
    const cssVar = COLOR_VAR_NAMES[key];
    const value = colors[key];
    if (value) lines.push(`  ${cssVar}: ${value};`);
  }
  return `${scope} {\n${lines.join("\n")}\n}`;
}

function buildRootExtras(theme: ReturnType<typeof getRuntimeConfig>["theme"]): string {
  const extras: string[] = [];
  if (theme.radius) {
    // The runtime-config stores radius as a unitless string (e.g. "0.625");
    // CSS expects a length. Allow either a raw number or a value already
    // suffixed with a unit.
    const radius = /[a-z%]/i.test(theme.radius) ? theme.radius : `${theme.radius}rem`;
    extras.push(`  --radius: ${radius};`);
  }
  if (theme.fontSans) extras.push(`  --font-sans: ${theme.fontSans};`);
  if (theme.fontSerif) extras.push(`  --font-serif: ${theme.fontSerif};`);
  if (theme.fontMono) extras.push(`  --font-mono: ${theme.fontMono};`);
  if (extras.length === 0) return "";
  return `:root {\n${extras.join("\n")}\n}`;
}

/**
 * Apply CSS custom properties from the runtime theme on first paint.
 *
 * Writes the full shadcn semantic variable set scoped to `:root` (light) and
 * `.dark` (dark). The dark-mode class itself is toggled by `next-themes`
 * (Task A3). Until that lands, the `.dark` block sits inert in the document
 * head; flipping the class on `<html>` would activate it.
 */
export function ThemeLoader() {
  useEffect(() => {
    const cfg = getRuntimeConfig();
    const { theme } = cfg;

    const blocks = [
      buildColorBlock(":root", theme.colors.light),
      buildColorBlock(".dark", theme.colors.dark),
    ];
    const extras = buildRootExtras(theme);
    if (extras) blocks.push(extras);
    const css = blocks.join("\n\n");

    let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (tag === null) {
      tag = document.createElement("style");
      tag.id = STYLE_TAG_ID;
      document.head.appendChild(tag);
    }
    tag.textContent = css;

    document.title = theme.appName || "Idun Agent";
  }, []);
  return null;
}
