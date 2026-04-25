"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

const LAYOUTS = ["branded", "minimal", "inspector"] as const;
const PRESETS: Record<string, Partial<Theme>> = {
  Default: { layout: "branded", colors: { primary: "#4f46e5", accent: "#7c3aed" } },
  Corporate: { layout: "minimal", colors: { primary: "#0f172a", accent: "#475569" } },
  Midnight: { layout: "branded", colors: { primary: "#818cf8", accent: "#a78bfa" } },
  Warm: { layout: "branded", colors: { primary: "#f97316", accent: "#ef4444" } },
};

type Theme = {
  appName?: string;
  greeting?: string;
  starterPrompts?: string[];
  layout?: (typeof LAYOUTS)[number];
  colors?: { primary?: string; accent?: string };
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["theme"],
    queryFn: api.getTheme,
  });
  const [draft, setDraft] = useState<Theme>({});

  useEffect(() => {
    if (data) setDraft((data.config as Theme) ?? {});
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.putTheme({ config: draft }),
    onSuccess: () => {
      toast.success("Theme saved");
      qc.invalidateQueries({ queryKey: ["theme"] });
    },
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(data?.config ?? {});

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
              value={draft.appName ?? ""}
              onChange={(e) => setDraft({ ...draft, appName: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Greeting
            </label>
            <Input
              value={draft.greeting ?? ""}
              onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
          Layout
        </div>
        <div className="flex gap-2">
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
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
            Colors
          </div>
          <div className="ml-auto flex gap-2">
            {Object.entries(PRESETS).map(([name, preset]) => (
              <Button
                key={name}
                size="sm"
                variant="secondary"
                onClick={() =>
                  setDraft({
                    ...draft,
                    layout: preset.layout ?? draft.layout,
                    colors: { ...(draft.colors ?? {}), ...preset.colors },
                  })
                }
              >
                {name}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">Primary</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={draft.colors?.primary ?? "#4f46e5"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    colors: { ...(draft.colors ?? {}), primary: e.target.value },
                  })
                }
                className="h-9 w-12 rounded border border-[var(--color-border)]"
              />
              <Input
                value={draft.colors?.primary ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    colors: { ...(draft.colors ?? {}), primary: e.target.value },
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">Accent</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={draft.colors?.accent ?? "#7c3aed"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    colors: { ...(draft.colors ?? {}), accent: e.target.value },
                  })
                }
                className="h-9 w-12 rounded border border-[var(--color-border)]"
              />
              <Input
                value={draft.colors?.accent ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    colors: { ...(draft.colors ?? {}), accent: e.target.value },
                  })
                }
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => setDraft((data?.config as Theme) ?? {})}
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
    </div>
  );
}
