/**
 * Runtime config injected by the FastAPI backend via /runtime-config.js.
 *
 * The script tag in app/layout.tsx loads /runtime-config.js with
 * strategy="beforeInteractive" so window.__IDUN_CONFIG__ is populated
 * before React hydration. Defaults below mirror the backend so SSR-out
 * static export and dev mode (no backend) still render reasonably.
 */

export type ThemeColors = {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
};

export type ThemeConfig = {
  appName: string;
  greeting: string;
  starterPrompts: string[];
  logo: { text: string; imageUrl?: string };
  layout: "branded" | "minimal" | "inspector";
  colors: { light: ThemeColors; dark: ThemeColors };
  radius: string;
  fontFamily: string;
  defaultColorScheme: "light" | "dark" | "system";
};

export type RuntimeConfig = {
  theme: ThemeConfig;
  authMode: "none" | "password" | "oidc";
  layout: "branded" | "minimal" | "inspector";
};

declare global {
  interface Window {
    __IDUN_CONFIG__?: RuntimeConfig;
  }
}

const DEFAULT_THEME: ThemeConfig = {
  appName: "Idun Agent",
  greeting: "How can I help?",
  starterPrompts: [],
  logo: { text: "IA" },
  layout: "branded",
  colors: {
    light: {
      primary: "#4f46e5",
      accent: "#7c3aed",
      background: "#ffffff",
      foreground: "#0a0a0a",
      muted: "#f5f5f5",
      border: "#e5e7eb",
    },
    dark: {
      primary: "#818cf8",
      accent: "#a78bfa",
      background: "#0a0a0a",
      foreground: "#fafafa",
      muted: "#1f1f1f",
      border: "#262626",
    },
  },
  radius: "0.5",
  fontFamily: "system",
  defaultColorScheme: "system",
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  theme: DEFAULT_THEME,
  authMode: "none",
  layout: "branded",
};

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined" || !window.__IDUN_CONFIG__) {
    return DEFAULT_RUNTIME_CONFIG;
  }
  return window.__IDUN_CONFIG__;
}
