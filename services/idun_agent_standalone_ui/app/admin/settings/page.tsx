"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import {
  type ThemeColors,
  type ThemeConfig,
  getRuntimeConfig,
} from "@/lib/runtime-config";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

const LAYOUTS = ["branded", "minimal", "inspector"] as const;
const RADII = ["0", "0.25", "0.5", "0.625", "0.75", "1"] as const;
const COLOR_KEYS: (keyof ThemeColors)[] = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "border",
  "input",
  "ring",
];
const COLOR_SCHEMES = ["light", "dark", "system"] as const;

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

const PRESETS: Record<string, ThemeConfig["colors"]> = {
  Editorial: {
    light: EDITORIAL_LIGHT,
    dark: EDITORIAL_DARK,
  },
};

const DEFAULT_THEME: ThemeConfig = {
  appName: "Idun Agent",
  greeting: "How can I help?",
  starterPrompts: [],
  logo: { text: "IA" },
  layout: "branded",
  colors: PRESETS.Editorial,
  radius: "0.625",
  fontSans: "",
  fontSerif: "",
  fontMono: "",
  defaultColorScheme: "system",
};

const MAX_LOGO_BYTES = 256 * 1024;
const MAX_STARTER_PROMPTS = 4;

function mergeWithDefaults(input: unknown): ThemeConfig {
  const cfg = (input ?? {}) as Partial<ThemeConfig>;
  const colors = (cfg.colors ?? {}) as Partial<ThemeConfig["colors"]>;
  return {
    appName: cfg.appName ?? DEFAULT_THEME.appName,
    greeting: cfg.greeting ?? DEFAULT_THEME.greeting,
    starterPrompts: Array.isArray(cfg.starterPrompts)
      ? cfg.starterPrompts.slice(0, MAX_STARTER_PROMPTS)
      : DEFAULT_THEME.starterPrompts,
    logo: {
      text: cfg.logo?.text ?? DEFAULT_THEME.logo.text,
      imageUrl: cfg.logo?.imageUrl,
    },
    layout: cfg.layout ?? DEFAULT_THEME.layout,
    colors: {
      light: { ...DEFAULT_THEME.colors.light, ...(colors.light ?? {}) },
      dark: { ...DEFAULT_THEME.colors.dark, ...(colors.dark ?? {}) },
    },
    radius: cfg.radius ?? DEFAULT_THEME.radius,
    fontSans: cfg.fontSans ?? DEFAULT_THEME.fontSans,
    fontSerif: cfg.fontSerif ?? DEFAULT_THEME.fontSerif,
    fontMono: cfg.fontMono ?? DEFAULT_THEME.fontMono,
    defaultColorScheme:
      cfg.defaultColorScheme ?? DEFAULT_THEME.defaultColorScheme,
  };
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["theme"],
    queryFn: api.getTheme,
  });
  const [draft, setDraft] = useState<ThemeConfig>(DEFAULT_THEME);
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialTheme = useMemo(
    () => mergeWithDefaults(data?.config),
    [data],
  );

  useEffect(() => {
    if (data) setDraft(initialTheme);
  }, [data, initialTheme]);

  const save = useMutation({
    mutationFn: () => api.putTheme({ config: draft as unknown }),
    onSuccess: () => {
      toast.success("Theme saved");
      qc.invalidateQueries({ queryKey: ["theme"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(initialTheme);

  const setColor = (key: keyof ThemeColors, value: string) => {
    setDraft((d) => ({
      ...d,
      colors: {
        ...d.colors,
        [scheme]: { ...d.colors[scheme], [key]: value },
      },
    }));
  };

  const onLogoFile = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo file too large (max 256 KB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setDraft((d) => ({
        ...d,
        logo: { ...d.logo, imageUrl: result },
      }));
    };
    reader.onerror = () => toast.error("Failed to read logo file");
    reader.readAsDataURL(file);
  };

  const runtimeAuthMode =
    typeof window !== "undefined" ? getRuntimeConfig().authMode : "none";

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Settings</h2>
        <Badge tone="info">Theme + branding</Badge>
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
          Identity
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">App name</label>
            <Input
              value={draft.appName}
              onChange={(e) => setDraft({ ...draft, appName: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">Greeting</label>
            <Input
              value={draft.greeting}
              onChange={(e) =>
                setDraft({ ...draft, greeting: e.target.value })
              }
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
          Logo
        </div>
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] flex items-center justify-center overflow-hidden">
            {draft.logo.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.logo.imageUrl}
                alt="logo preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-sm font-semibold">
                {draft.logo.text || "IA"}
              </span>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-fg)]/70">
                Monogram (text)
              </label>
              <Input
                value={draft.logo.text}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    logo: { ...draft.logo, text: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-fg)]/70">
                Image (max 256 KB, base64-encoded)
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onLogoFile(file);
                    e.target.value = "";
                  }}
                  className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-[var(--color-border)] file:bg-[var(--color-muted)] file:text-[var(--color-fg)]"
                />
                {draft.logo.imageUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        logo: { ...draft.logo, imageUrl: undefined },
                      })
                    }
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
          Layout
        </div>
        <div className="flex gap-2 flex-wrap">
          {LAYOUTS.map((l) => (
            <button
              type="button"
              key={l}
              onClick={() => setDraft({ ...draft, layout: l })}
              className={`px-3 py-1 rounded-md border text-sm ${
                draft.layout === l
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-fg)]/70 hover:bg-[var(--color-muted)]"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
            Colors
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {Object.entries(PRESETS).map(([name, colors]) => (
              <Button
                key={name}
                size="sm"
                variant="secondary"
                onClick={() => setDraft({ ...draft, colors })}
              >
                {name}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {(["light", "dark"] as const).map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setScheme(s)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
                scheme === s
                  ? "border-[var(--color-primary)] text-[var(--color-fg)]"
                  : "border-transparent text-[var(--color-fg)]/60 hover:text-[var(--color-fg)]"
              }`}
            >
              {s === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {COLOR_KEYS.map((key) => (
            <div key={key} className="space-y-1">
              <label className="text-xs text-[var(--color-fg)]/70 capitalize">
                {key}
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={draft.colors[scheme][key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="h-9 w-12 rounded border border-[var(--color-border)]"
                />
                <Input
                  value={draft.colors[scheme][key]}
                  onChange={(e) => setColor(key, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
          Typography & shape
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">Radius</label>
            <select
              value={draft.radius}
              onChange={(e) => setDraft({ ...draft, radius: e.target.value })}
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r === "0" ? "0 (square)" : `${r}rem`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Font family — sans (override; blank = Geist default)
            </label>
            <Input
              value={draft.fontSans}
              placeholder="e.g. var(--font-sans)"
              onChange={(e) =>
                setDraft({ ...draft, fontSans: e.target.value })
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Font family — serif (blank = Fraunces default)
            </label>
            <Input
              value={draft.fontSerif}
              placeholder="e.g. var(--font-serif)"
              onChange={(e) =>
                setDraft({ ...draft, fontSerif: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Font family — mono (blank = Geist Mono default)
            </label>
            <Input
              value={draft.fontMono}
              placeholder="e.g. var(--font-mono)"
              onChange={(e) =>
                setDraft({ ...draft, fontMono: e.target.value })
              }
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-fg)]/70">
            Default color scheme
          </div>
          <div className="flex gap-3 text-sm">
            {COLOR_SCHEMES.map((s) => (
              <label key={s} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="defaultColorScheme"
                  value={s}
                  checked={draft.defaultColorScheme === s}
                  onChange={() =>
                    setDraft({ ...draft, defaultColorScheme: s })
                  }
                />
                <span className="capitalize">{s}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
            Starter prompts
          </div>
          <span className="text-xs text-[var(--color-fg)]/50">
            {draft.starterPrompts.length}/{MAX_STARTER_PROMPTS}
          </span>
          <div className="ml-auto">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={draft.starterPrompts.length >= MAX_STARTER_PROMPTS}
              onClick={() =>
                setDraft({
                  ...draft,
                  starterPrompts: [...draft.starterPrompts, ""],
                })
              }
            >
              + Add prompt
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {draft.starterPrompts.length === 0 && (
            <div className="text-xs text-[var(--color-fg)]/50">
              No starter prompts. Click "+ Add prompt" to create one.
            </div>
          )}
          {draft.starterPrompts.map((prompt, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={prompt}
                onChange={(e) => {
                  const next = draft.starterPrompts.slice();
                  next[i] = e.target.value;
                  setDraft({ ...draft, starterPrompts: next });
                }}
                placeholder="Suggest an example question…"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Remove prompt"
                onClick={() =>
                  setDraft({
                    ...draft,
                    starterPrompts: draft.starterPrompts.filter(
                      (_, j) => j !== i,
                    ),
                  })
                }
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => setDraft(initialTheme)}
        >
          Revert
        </Button>
        <Button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save theme"}
        </Button>
      </div>

      <SessionsSection />
      {runtimeAuthMode === "password" && <SecuritySection />}
    </div>
  );
}

function SessionsSection() {
  // The session TTL is configured via env var (IDUN_SESSION_TTL_SECONDS) at
  // process start, not stored in the DB. Surfacing it as read-only here keeps
  // the spec parity ("Settings — session TTL editor") without a backend round
  // trip; ops folks edit the env var on their VM / Cloud Run service.
  const ttl =
    typeof window !== "undefined"
      ? (window.__IDUN_CONFIG__ as unknown as { sessionTtlSeconds?: number })
          ?.sessionTtlSeconds ?? 86400
      : 86400;
  const hours = Math.round((ttl / 3600) * 10) / 10;
  return (
    <Card className="p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
        Sessions
      </div>
      <div className="text-sm text-[var(--color-fg)]/80">
        Admin session TTL: <strong>{ttl.toLocaleString()}s</strong>
        <span className="text-[var(--color-fg)]/60"> (~{hours}h)</span>
      </div>
      <div className="text-xs text-[var(--color-fg)]/60">
        Configured via <code>IDUN_SESSION_TTL_SECONDS</code> on the standalone
        process. Restart the container after changing it. Sliding renewal
        re-issues the cookie when the user hits the API within 10% of the TTL
        boundary.
      </div>
    </Card>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () => api.changePassword({ current, next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password updated. You're still signed in.");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        toast.error("Current password is incorrect.");
        return;
      }
      if (e instanceof ApiError && e.status === 400) {
        const detail = e.detail as
          | { message?: string; detail?: string }
          | undefined;
        toast.error(detail?.message ?? detail?.detail ?? "Validation failed");
        return;
      }
      toast.error("Failed to change password");
    },
  });

  const validate = (): string | null => {
    if (!current) return "Enter your current password";
    if (next.length < 8) return "New password must be at least 8 characters";
    if (next !== confirm) return "Passwords do not match";
    return null;
  };

  const onSubmit = () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    change.mutate();
  };

  const canSubmit =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    !change.isPending;

  return (
    <Card className="p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
        Security
      </div>
      <div className="grid grid-cols-1 gap-3 max-w-md">
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/70">
            Current password
          </label>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/70">
            New password (min 8 chars)
          </label>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/70">
            Confirm new password
          </label>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <div>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {change.isPending ? "Saving…" : "Change password"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
