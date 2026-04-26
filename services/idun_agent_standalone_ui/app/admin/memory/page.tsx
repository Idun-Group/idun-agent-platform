"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { SaveToolbar } from "@/components/admin/SaveToolbar";
import { YamlEditor } from "@/components/admin/YamlEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type MemoryType = "memory" | "sqlite" | "postgres";

type MemoryForm = {
  type: MemoryType;
  db_url: string;
};

const TYPES: { id: MemoryType; label: string; help: string }[] = [
  { id: "memory", label: "In-memory", help: "Volatile checkpointer (default)" },
  { id: "sqlite", label: "SQLite", help: "URL must start with sqlite:///" },
  { id: "postgres", label: "PostgreSQL", help: "URL must start with postgresql://" },
];

function configToForm(config: Record<string, unknown> | undefined): MemoryForm {
  const type = (config?.type as MemoryType | undefined) ?? "memory";
  const db_url =
    typeof config?.db_url === "string" ? (config.db_url as string) : "";
  return { type, db_url };
}

function formToConfig(f: MemoryForm): Record<string, unknown> {
  if (f.type === "memory") return { type: "memory" };
  return { type: f.type, db_url: f.db_url };
}

function validate(f: MemoryForm): string | null {
  if (f.type === "memory") return null;
  if (!f.db_url.trim()) return "db_url is required";
  if (f.type === "sqlite" && !f.db_url.startsWith("sqlite:///"))
    return "SQLite URL must start with sqlite:///";
  if (
    f.type === "postgres" &&
    !(f.db_url.startsWith("postgresql://") || f.db_url.startsWith("postgres://"))
  )
    return "Postgres URL must start with postgresql:// or postgres://";
  return null;
}

export default function MemoryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["memory"],
    queryFn: api.getMemory,
  });
  const [form, setForm] = useState<MemoryForm>({ type: "memory", db_url: "" });
  const [editYaml, setEditYaml] = useState(false);

  const initialForm = useMemo(
    () => configToForm(data?.config as Record<string, unknown> | undefined),
    [data],
  );

  useEffect(() => {
    if (data) setForm(initialForm);
  }, [data, initialForm]);

  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      api.putMemory({ config: next }),
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) toast.warning("Restart required to apply.");
      else toast.success("Saved & reloaded");
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  if (isLoading) return <div className="p-6">Loading…</div>;

  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const error = validate(form);

  return (
    <>
      <SaveToolbar
        title="Memory / Checkpointer"
        dirty={dirty}
        busy={save.isPending}
        onRevert={() => setForm(initialForm)}
        onSave={() => {
          if (error) {
            toast.error(error);
            return;
          }
          save.mutate(formToConfig(form));
        }}
        extraActions={
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => setEditYaml((v) => !v)}
          >
            {editYaml ? "Done editing YAML" : "Edit YAML"}
          </Button>
        }
      />
      <div className="p-6 max-w-3xl space-y-4">
        <Card className="p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
            Storage type
          </div>
          <div className="flex gap-2 flex-wrap">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setForm({ ...form, type: t.id })}
                className={`px-3 py-1 rounded-md border text-sm ${
                  form.type === t.id
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-fg)]/70 hover:bg-[var(--color-muted)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-[var(--color-fg)]/60">
            {TYPES.find((t) => t.id === form.type)?.help}
          </div>
        </Card>

        {form.type !== "memory" && (
          <Card className="p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
              Connection
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-fg)]/70">db_url</label>
              <Input
                value={form.db_url}
                onChange={(e) =>
                  setForm({ ...form, db_url: e.target.value })
                }
                placeholder={
                  form.type === "sqlite"
                    ? "sqlite:///./checkpoint.db"
                    : "postgresql://user:pass@host:5432/db"
                }
              />
              {error && (
                <div className="text-xs text-red-500 font-mono">{error}</div>
              )}
            </div>
          </Card>
        )}

        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/50 mb-2">
            {editYaml ? "YAML editor" : "YAML preview"}
          </div>
          <YamlEditor
            value={formToConfig(form)}
            readOnly={!editYaml}
            onChange={(v) => {
              setForm(configToForm(v as Record<string, unknown>));
            }}
          />
        </div>
      </div>
    </>
  );
}
