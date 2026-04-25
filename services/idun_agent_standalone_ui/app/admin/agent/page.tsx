"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type AgentRead, ApiError, api } from "@/lib/api";
import { SaveToolbar } from "@/components/admin/SaveToolbar";
import { YamlEditor } from "@/components/admin/YamlEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const FRAMEWORKS = ["langgraph", "adk", "haystack"] as const;

export default function AgentPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent"],
    queryFn: api.getAgent,
  });
  const [draft, setDraft] = useState<AgentRead | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [editYaml, setEditYaml] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (body: AgentRead) =>
      api.putAgent({
        name: body.name,
        framework: body.framework,
        graph_definition: body.graph_definition,
        config: body.config,
      }),
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) {
        setRestartRequired(true);
        toast.warning("Restart required to apply this change.");
      } else {
        setRestartRequired(false);
        toast.success("Saved & reloaded");
      }
      qc.invalidateQueries({ queryKey: ["agent"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const reload = useMutation({
    mutationFn: () => api.forceReload(),
    onSuccess: () => {
      toast.success("Agent reloaded");
      qc.invalidateQueries({ queryKey: ["agent"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Reload failed");
    },
  });

  if (isLoading || !draft) return <div className="p-6">Loading…</div>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  return (
    <>
      <SaveToolbar
        title="Agent configuration"
        dirty={dirty}
        busy={save.isPending}
        onRevert={() => data && setDraft(data)}
        onSave={() => save.mutate(draft)}
        extraActions={
          <>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setEditYaml((v) => !v)}
            >
              {editYaml ? "Done editing YAML" : "Edit YAML"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              title="Reload now (no config change)"
              disabled={reload.isPending}
              onClick={() => reload.mutate()}
            >
              {reload.isPending ? "Reloading…" : "Reload now"}
            </Button>
          </>
        }
      />
      {restartRequired && (
        <div className="m-6 mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 px-3 py-2 text-sm">
          Structural change queued — restart the container to activate.
        </div>
      )}
      <form
        className="p-6 max-w-3xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
            Identity
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-fg)]/70">Name</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--color-fg)]/70">
                Framework
              </label>
              <select
                value={draft.framework}
                onChange={(e) =>
                  setDraft({ ...draft, framework: e.target.value })
                }
                className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm"
              >
                {FRAMEWORKS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
            Graph
          </h3>
          <div>
            <label className="text-xs text-[var(--color-fg)]/70">
              Definition path
            </label>
            <Input
              value={draft.graph_definition}
              onChange={(e) =>
                setDraft({ ...draft, graph_definition: e.target.value })
              }
              placeholder="./agent.py:graph"
            />
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
            Advanced ({editYaml ? "YAML editor" : "YAML preview"})
          </h3>
          <YamlEditor
            value={draft.config}
            onChange={(v) =>
              setDraft({ ...draft, config: v as Record<string, unknown> })
            }
            readOnly={!editYaml}
          />
        </section>
      </form>
    </>
  );
}
