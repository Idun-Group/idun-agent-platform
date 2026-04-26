"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type Singleton } from "@/lib/api";
import { SaveToolbar } from "@/components/admin/SaveToolbar";
import { YamlEditor } from "@/components/admin/YamlEditor";
import { Button } from "@/components/ui/button";

type Props<T> = {
  title: string;
  queryKey: string;
  fetcher: () => Promise<Singleton<T>>;
  saver: (body: Singleton<T>) => Promise<Singleton<T>>;
  initialEnabled?: boolean;
};

export function SingletonEditor<T>({
  title,
  queryKey,
  fetcher,
  saver,
  initialEnabled,
}: Props<T>) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: fetcher });
  const [draft, setDraft] = useState<Singleton<T> | null>(null);
  const [editYaml, setEditYaml] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: saver,
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) toast.warning("Restart required to apply.");
      else toast.success("Saved & reloaded");
      qc.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: () => toast.error("Save failed"),
  });

  if (isLoading || !draft) return <div className="p-6">Loading…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  return (
    <>
      <SaveToolbar
        title={title}
        dirty={dirty}
        busy={save.isPending}
        onRevert={() => data && setDraft(data)}
        onSave={() => save.mutate(draft)}
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
        {initialEnabled !== undefined && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            Enabled
          </label>
        )}
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/50 mb-2">
            Configuration ({editYaml ? "YAML editor" : "YAML preview"})
          </div>
          <YamlEditor
            value={draft.config}
            onChange={(v) => setDraft({ ...draft, config: v as T })}
            readOnly={!editYaml}
          />
        </div>
      </div>
    </>
  );
}
