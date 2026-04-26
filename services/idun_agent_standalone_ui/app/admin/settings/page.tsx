"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Upload, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api";
import {
  type ThemeColors,
  type ThemeConfig,
  getRuntimeConfig,
} from "@/lib/runtime-config";

// ---------------------------------------------------------------------------
// Constants — editorial defaults + shape metadata.
// Both EDITORIAL_* palettes mirror lib/runtime-config.ts so a "Reset to
// editorial defaults" inside the Appearance tab restores a known-good state
// even when the runtime config has been customised.
// ---------------------------------------------------------------------------

const COLOR_KEYS: { key: keyof ThemeColors; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "foreground", label: "Foreground" },
  { key: "card", label: "Card" },
  { key: "cardForeground", label: "Card foreground" },
  { key: "popover", label: "Popover" },
  { key: "popoverForeground", label: "Popover foreground" },
  { key: "primary", label: "Primary" },
  { key: "primaryForeground", label: "Primary foreground" },
  { key: "secondary", label: "Secondary" },
  { key: "secondaryForeground", label: "Secondary foreground" },
  { key: "muted", label: "Muted" },
  { key: "mutedForeground", label: "Muted foreground" },
  { key: "accent", label: "Accent" },
  { key: "accentForeground", label: "Accent foreground" },
  { key: "destructive", label: "Destructive" },
  { key: "destructiveForeground", label: "Destructive foreground" },
  { key: "border", label: "Border" },
  { key: "input", label: "Input" },
  { key: "ring", label: "Ring" },
];

const COLOR_SCHEMES = ["light", "dark", "system"] as const;
const LAYOUTS = ["branded", "minimal", "inspector"] as const;
const MAX_LOGO_BYTES = 256 * 1024;
const MAX_STARTER_PROMPTS = 4;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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
  colors: { light: EDITORIAL_LIGHT, dark: EDITORIAL_DARK },
  radius: "0.625",
  fontSans: "",
  fontSerif: "",
  fontMono: "",
  defaultColorScheme: "system",
};

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

const VALID_TABS = ["profile", "appearance", "layout", "password"] as const;
type TabKey = (typeof VALID_TABS)[number];

function isTabKey(v: string | null): v is TabKey {
  return !!v && (VALID_TABS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Page shell — top-level Tabs deep-linked via ?tab=…
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: TabKey = isTabKey(params.get("tab"))
    ? (params.get("tab") as TabKey)
    : "profile";

  const setTab = (next: string) => {
    const qp = new URLSearchParams(params.toString());
    qp.set("tab", next);
    router.replace(`?${qp.toString()}`);
  };

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    // Surface auth errors as a soft fallback; the AuthGuard already handles
    // hard 401s via the apiFetch redirect logic.
    retry: false,
  });

  // Runtime auth mode covers the "no session" case (auth_mode=none); api.me()
  // is the authoritative source when authenticated. They normally agree.
  const runtimeAuthMode =
    typeof window !== "undefined" ? getRuntimeConfig().authMode : "none";
  const authMode = meData?.auth_mode ?? runtimeAuthMode;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Profile, theme, layout, and account.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="password" disabled={authMode !== "password"}>
            Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab authMode={authMode} />
        </TabsContent>
        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="layout" className="mt-4">
          <LayoutTab />
        </TabsContent>
        <TabsContent value="password" className="mt-4">
          <PasswordTab authMode={authMode} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

function ProfileTab({ authMode }: { authMode: string }) {
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
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Read-only account details surfaced from the running standalone
          process.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Username
            </div>
            <div className="text-sm text-foreground">admin</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Auth mode
            </div>
            <Badge variant={authMode === "none" ? "secondary" : "default"}>
              {authMode}
            </Badge>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Admin session TTL
          </div>
          <div className="text-sm text-foreground">
            {ttl.toLocaleString()}s{" "}
            <span className="text-muted-foreground">(~{hours}h)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Configured via{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              IDUN_SESSION_TTL_SECONDS
            </code>{" "}
            on the standalone process. Restart the container after changing it.
            Sliding renewal re-issues the cookie when the user hits the API
            within 10% of the TTL boundary.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Appearance tab — identity, color palette, typography, radius, prompts.
// ---------------------------------------------------------------------------

function AppearanceTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["theme"],
    queryFn: api.getTheme,
  });
  const initialTheme = useMemo(
    () => mergeWithDefaults(data?.config),
    [data],
  );
  const [draft, setDraft] = useState<ThemeConfig>(DEFAULT_THEME);
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) setDraft(initialTheme);
  }, [data, initialTheme]);

  const save = useMutation({
    mutationFn: () => api.putTheme({ config: draft as unknown }),
    onSuccess: () => {
      toast.success("Appearance saved. Refresh the chat tab to see changes.");
      qc.invalidateQueries({ queryKey: ["theme"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(initialTheme);

  const setColor = (key: keyof ThemeColors, value: string) =>
    setDraft((d) => ({
      ...d,
      colors: { ...d.colors, [scheme]: { ...d.colors[scheme], [key]: value } },
    }));

  const resetColor = (key: keyof ThemeColors) => {
    const def = scheme === "light" ? EDITORIAL_LIGHT : EDITORIAL_DARK;
    setColor(key, def[key]);
  };

  const resetAllColors = () => {
    setDraft((d) => ({
      ...d,
      colors: { light: EDITORIAL_LIGHT, dark: EDITORIAL_DARK },
    }));
    toast.success("Editorial palette restored. Save to persist.");
  };

  const onLogoFile = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo file too large (max 256 KB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setDraft((d) => ({ ...d, logo: { ...d.logo, imageUrl: result } }));
    };
    reader.onerror = () => toast.error("Failed to read logo file");
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            App name, greeting, and logo shown in the chat surface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="app-name">App name</Label>
              <Input
                id="app-name"
                value={draft.appName}
                onChange={(e) =>
                  setDraft({ ...draft, appName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="greeting">Greeting</Label>
              <Input
                id="greeting"
                value={draft.greeting}
                onChange={(e) =>
                  setDraft({ ...draft, greeting: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start">
            <div className="h-16 w-16 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden">
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
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="logo-text">Monogram (max 4 chars)</Label>
                <Input
                  id="logo-text"
                  maxLength={4}
                  value={draft.logo.text}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      logo: { ...draft.logo, text: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo-url">Logo image URL</Label>
                <Input
                  id="logo-url"
                  type="url"
                  placeholder="https://…"
                  value={draft.logo.imageUrl ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      logo: {
                        ...draft.logo,
                        imageUrl: e.target.value || undefined,
                      },
                    })
                  }
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onLogoFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    Upload (max 256 KB)
                  </Button>
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
                      <X className="mr-1 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default color scheme */}
      <Card>
        <CardHeader>
          <CardTitle>Default color scheme</CardTitle>
          <CardDescription>
            Initial light/dark mode for new visitors. Users can still flip via
            the topbar toggle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={draft.defaultColorScheme}
            onValueChange={(v) =>
              setDraft({
                ...draft,
                defaultColorScheme: v as ThemeConfig["defaultColorScheme"],
              })
            }
            className="grid grid-cols-3 gap-3"
          >
            {COLOR_SCHEMES.map((s) => (
              <Label
                key={s}
                htmlFor={`scheme-${s}`}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
              >
                <RadioGroupItem id={`scheme-${s}`} value={s} />
                <span className="capitalize">{s}</span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Color palette */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Color palette</CardTitle>
            <CardDescription>
              All 18 shadcn semantic tokens. Light + dark scheme have separate
              values.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetAllColors}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset to editorial defaults
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={scheme}
            onValueChange={(v) => setScheme(v as "light" | "dark")}
          >
            <TabsList>
              <TabsTrigger value="light">Light</TabsTrigger>
              <TabsTrigger value="dark">Dark</TabsTrigger>
            </TabsList>

            {(["light", "dark"] as const).map((s) => (
              <TabsContent key={s} value={s} className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {COLOR_KEYS.map(({ key, label }) => (
                    <ColorRow
                      key={key}
                      label={label}
                      value={draft.colors[s][key]}
                      onChange={(v) => setColor(key, v)}
                      onReset={() => resetColor(key)}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <CardDescription>
            CSS family stacks. Leave blank to keep the editorial defaults
            (Geist / Fraunces / Geist Mono).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="font-sans">Sans</Label>
            <Input
              id="font-sans"
              placeholder="var(--font-sans)"
              value={draft.fontSans}
              onChange={(e) =>
                setDraft({ ...draft, fontSans: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="font-serif">Serif</Label>
            <Input
              id="font-serif"
              placeholder="var(--font-serif)"
              value={draft.fontSerif}
              onChange={(e) =>
                setDraft({ ...draft, fontSerif: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="font-mono">Mono</Label>
            <Input
              id="font-mono"
              placeholder="var(--font-mono)"
              value={draft.fontMono}
              onChange={(e) =>
                setDraft({ ...draft, fontMono: e.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Radius */}
      <Card>
        <CardHeader>
          <CardTitle>Corner radius</CardTitle>
          <CardDescription>
            Sets the <code>--radius</code> CSS variable consumed across all
            shadcn primitives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 max-w-sm">
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1.5"
              value={draft.radius}
              onChange={(e) => setDraft({ ...draft, radius: e.target.value })}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">rem</span>
            <div
              className="ml-2 h-8 w-8 border border-border bg-muted"
              style={{ borderRadius: `${draft.radius}rem` }}
              aria-hidden="true"
            />
          </div>
        </CardContent>
      </Card>

      {/* Starter prompts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Starter prompts</CardTitle>
            <CardDescription>
              Suggested chat openers. {draft.starterPrompts.length}/
              {MAX_STARTER_PROMPTS}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={draft.starterPrompts.length >= MAX_STARTER_PROMPTS}
            onClick={() =>
              setDraft({
                ...draft,
                starterPrompts: [...draft.starterPrompts, ""],
              })
            }
          >
            Add prompt
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.starterPrompts.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No starter prompts. Click "Add prompt" to create one.
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
                size="icon"
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
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => setDraft(initialTheme)}
          >
            Revert
          </Button>
          <Button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save appearance"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// One row inside the Color palette grid: swatch (opens native picker) + hex
// input + reset button. Hex input accepts non-hex values too (the runtime
// stores rgba() for the focus ring); validation is non-blocking.
function ColorRow({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const colorRef = useRef<HTMLInputElement>(null);
  const isHex = HEX_RE.test(value);
  // The native <input type="color"> only understands #rrggbb; for rgba() we
  // approximate by stripping alpha when handing off to the picker.
  const pickerValue = isHex
    ? value
    : (() => {
        const m = value.match(/#?([0-9a-fA-F]{6})/);
        return m ? `#${m[1]}` : "#000000";
      })();

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Pick ${label} color`}
          onClick={() => colorRef.current?.click()}
          className="h-8 w-8 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: value }}
        />
        <input
          ref={colorRef}
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs h-8"
          aria-invalid={!isHex && !value.startsWith("rgb")}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Reset ${label} to default`}
          onClick={onReset}
          className="h-8 w-8"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout tab — chat layout switcher with thumbnail cards.
// ---------------------------------------------------------------------------

function LayoutTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["theme"],
    queryFn: api.getTheme,
  });
  const initialTheme = useMemo(
    () => mergeWithDefaults(data?.config),
    [data],
  );
  const [layout, setLayout] = useState<ThemeConfig["layout"]>("branded");

  useEffect(() => {
    if (data) setLayout(initialTheme.layout);
  }, [data, initialTheme]);

  const save = useMutation({
    mutationFn: () =>
      api.putTheme({ config: { ...initialTheme, layout } as unknown }),
    onSuccess: () => {
      toast.success("Layout saved. Refresh the chat tab to see changes.");
      qc.invalidateQueries({ queryKey: ["theme"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const dirty = layout !== initialTheme.layout;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat layout</CardTitle>
        <CardDescription>
          Selects the chrome wrapped around the chat surface served at{" "}
          <code>/</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={layout}
          onValueChange={(v) => setLayout(v as ThemeConfig["layout"])}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          {LAYOUTS.map((l) => (
            <LayoutCard
              key={l}
              value={l}
              selected={layout === l}
              title={LAYOUT_META[l].title}
              description={LAYOUT_META[l].description}
              thumbnail={LAYOUT_META[l].thumbnail}
            />
          ))}
        </RadioGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => setLayout(initialTheme.layout)}
        >
          Revert
        </Button>
        <Button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save layout"}
        </Button>
      </CardFooter>
    </Card>
  );
}

const LAYOUT_META: Record<
  ThemeConfig["layout"],
  { title: string; description: string; thumbnail: React.ReactNode }
> = {
  branded: {
    title: "Branded",
    description: "Sidebar + main + composer. The default editorial chrome.",
    thumbnail: <BrandedThumb />,
  },
  minimal: {
    title: "Minimal",
    description: "Centered conversation with a bottom composer.",
    thumbnail: <MinimalThumb />,
  },
  inspector: {
    title: "Inspector",
    description: "Sidebar + main + right rail for tool calls and reasoning.",
    thumbnail: <InspectorThumb />,
  },
};

function LayoutCard({
  value,
  selected,
  title,
  description,
  thumbnail,
}: {
  value: string;
  selected: boolean;
  title: string;
  description: string;
  thumbnail: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={`layout-${value}`}
      className={`flex flex-col gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
        selected
          ? "border-primary bg-muted/40"
          : "border-border hover:bg-muted/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`layout-${value}`} value={value} />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div className="rounded-md border border-border bg-background p-2 flex items-center justify-center">
        {thumbnail}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </Label>
  );
}

// Schematic SVG thumbnails — minimal line-art previews. The scope is enough to
// communicate gross shape (sidebar/main/composer/rail) without trying to look
// like a real screenshot.
function BrandedThumb() {
  return (
    <svg
      viewBox="0 0 120 80"
      className="h-16 w-full"
      role="img"
      aria-label="Branded layout: sidebar, main panel, and composer"
    >
      <rect x="4" y="4" width="28" height="72" rx="2" className="fill-muted stroke-border" />
      <rect x="36" y="4" width="80" height="56" rx="2" className="fill-card stroke-border" />
      <rect x="36" y="64" width="80" height="12" rx="2" className="fill-muted stroke-border" />
    </svg>
  );
}

function MinimalThumb() {
  return (
    <svg
      viewBox="0 0 120 80"
      className="h-16 w-full"
      role="img"
      aria-label="Minimal layout: centered chat with a bottom composer"
    >
      <rect x="4" y="4" width="112" height="56" rx="2" className="fill-card stroke-border" />
      <rect x="4" y="64" width="112" height="12" rx="2" className="fill-muted stroke-border" />
    </svg>
  );
}

function InspectorThumb() {
  return (
    <svg
      viewBox="0 0 120 80"
      className="h-16 w-full"
      role="img"
      aria-label="Inspector layout: sidebar, main, and right rail"
    >
      <rect x="4" y="4" width="24" height="72" rx="2" className="fill-muted stroke-border" />
      <rect x="32" y="4" width="56" height="72" rx="2" className="fill-card stroke-border" />
      <rect x="92" y="4" width="24" height="72" rx="2" className="fill-muted stroke-border" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Password tab — change password via /admin/api/v1/auth/change-password.
// ---------------------------------------------------------------------------

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(12, "New password must be at least 12 characters"),
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.next !== v.confirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm"],
        message: "Passwords do not match",
      });
    }
  });

type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordTab({ authMode }: { authMode: string }) {
  if (authMode !== "password") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Password management is unavailable in the current auth mode.
        </CardContent>
      </Card>
    );
  }
  return <PasswordForm />;
}

function PasswordForm() {
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  });

  const change = useMutation({
    mutationFn: (values: PasswordValues) =>
      api.changePassword({ current: values.current, next: values.next }),
    onSuccess: () => {
      form.reset({ current: "", next: "", confirm: "" });
      toast.success("Password changed. You'll be signed out shortly.");
      // Brief delay so the toast is legible before the redirect.
      setTimeout(() => {
        api.logout().finally(() => {
          window.location.href = "/login/";
        });
      }, 1500);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        form.setError("current", { message: "Current password is incorrect" });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Updates the standalone admin password. You'll be signed out
          afterwards.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => change.mutate(v))}>
          <CardContent className="space-y-4 max-w-md">
            <FormField
              control={form.control}
              name="current"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="next"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Minimum 12 characters.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? "Saving…" : "Change password"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
