/**
 * Runtime config injected by the FastAPI backend via /runtime-config.js.
 *
 * The script tag in app/layout.tsx loads /runtime-config.js with
 * strategy="beforeInteractive" so window.__IDUN_CONFIG__ is populated
 * before React hydration. Defaults below mirror the backend so SSR-out
 * static export and dev mode (no backend) still render reasonably.
 */

export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
};

export type ThemeConfig = {
  appName: string;
  greeting: string;
  starterPrompts: string[];
  logo: { text: string; imageUrl?: string };
  layout: "branded" | "minimal" | "inspector";
  colors: { light: ThemeColors; dark: ThemeColors };
  radius: string;
  fontSans: string;
  fontSerif: string;
  fontMono: string;
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

const EDITORIAL_LIGHT: ThemeColors = {
  background: "#f7f6f0",
  foreground: "#1d1c1a",
  card: "#ffffff",
  cardForeground: "#1d1c1a",
  popover: "#ffffff",
  popoverForeground: "#1d1c1a",
  primary: "#1d1c1a",
  primaryForeground: "#f7f6f0",
  secondary: "#f0eee2",
  secondaryForeground: "#1d1c1a",
  muted: "#f0eee2",
  mutedForeground: "#6b6a65",
  accent: "#c96442",
  accentForeground: "#ffffff",
  destructive: "#dc2626",
  destructiveForeground: "#ffffff",
  border: "#e7e4d7",
  input: "#e7e4d7",
  ring: "rgba(201, 100, 66, 0.4)",
};

const EDITORIAL_DARK: ThemeColors = {
  background: "#15140f",
  foreground: "#f5f4ec",
  card: "#1d1c1a",
  cardForeground: "#f5f4ec",
  popover: "#1d1c1a",
  popoverForeground: "#f5f4ec",
  primary: "#f5f4ec",
  primaryForeground: "#15140f",
  secondary: "#2a2925",
  secondaryForeground: "#f5f4ec",
  muted: "#2a2925",
  mutedForeground: "#a1a097",
  accent: "#d97757",
  accentForeground: "#15140f",
  destructive: "#ef4444",
  destructiveForeground: "#f5f4ec",
  border: "#2a2925",
  input: "#2a2925",
  ring: "rgba(217, 119, 87, 0.5)",
};

const DEFAULT_THEME: ThemeConfig = {
  appName: "Idun Agent",
  greeting: "How can I help?",
  starterPrompts: [],
  logo: { text: "IA" },
  layout: "branded",
  colors: {
    light: EDITORIAL_LIGHT,
    dark: EDITORIAL_DARK,
  },
  radius: "0.625",
  fontSans: "",
  fontSerif: "",
  fontMono: "",
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
