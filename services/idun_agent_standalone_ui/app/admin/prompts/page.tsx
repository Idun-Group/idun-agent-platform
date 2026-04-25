"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { YamlEditor } from "@/components/admin/YamlEditor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function PromptsPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["prompts"],
    queryFn: api.listPrompts,
  });
  const [creating, setCreating] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState("");

  const grouped = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      m.set(r.prompt_key, [...(m.get(r.prompt_key) ?? []), r]);
    }
    return Array.from(m.entries()).map(([k, vs]) => ({
      key: k,
      versions: vs.sort((a, b) => b.version - a.version),
    }));
  }, [rows]);

  const variables = useMemo(() => {
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(draftContent)) !== null) out.add(m[1]);
    return Array.from(out);
  }, [draftContent]);

  const create = useMutation({
    mutationFn: api.createPrompt,
    onSuccess: () => {
      toast.success("New version created");
      setCreating(false);
      setDraftKey("");
      setDraftContent("");
      setDraftTags("");
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
  const del = useMutation({
    mutationFn: api.deletePrompt,
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-[var(--color-fg)]">Prompts</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          + New prompt
        </Button>
      </div>

      {grouped.map((g) => (
        <Card key={g.key} className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium font-mono text-sm">{g.key}</span>
            <Badge tone="info">{g.versions.length} versions</Badge>
          </div>
          <div className="grid gap-2">
            {g.versions.map((v) => (
              <div
                key={v.id}
                className="border border-[var(--color-border)] rounded p-2 flex items-start gap-3"
              >
                <Badge tone="neutral">v{v.version}</Badge>
                <pre className="flex-1 text-xs whitespace-pre-wrap font-mono text-[var(--color-fg)]/80">
                  {v.content}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Delete this version?")) del.mutate(v.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {grouped.length === 0 && !creating && (
        <Card className="p-6 text-sm text-[var(--color-fg)]/60">
          No prompts yet.
        </Card>
      )}

      {creating && (
        <Card className="p-4 space-y-3">
          <div className="font-medium text-sm">New prompt version</div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Prompt key
            </label>
            <Input
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="system-prompt"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">Content</label>
            <YamlEditor
              mode="jinja"
              text={draftContent}
              onChange={(v) => setDraftContent(typeof v === "string" ? v : "")}
              rows={12}
            />
          </div>
          {variables.length > 0 && (
            <div className="flex flex-wrap gap-1 text-xs">
              <span className="text-[var(--color-fg)]/60">Variables:</span>
              {variables.map((v) => (
                <Badge key={v} tone="info">
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Tags (comma-separated)
            </label>
            <Input
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              placeholder="latest, production"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draftKey.trim() || !draftContent.trim() || create.isPending}
              onClick={() =>
                create.mutate({
                  prompt_key: draftKey.trim(),
                  content: draftContent,
                  tags: draftTags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            >
              {create.isPending ? "Saving…" : "Create version"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
