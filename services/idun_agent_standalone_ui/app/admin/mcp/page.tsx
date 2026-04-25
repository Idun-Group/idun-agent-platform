"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type McpRead, api } from "@/lib/api";
import { JsonEditor } from "@/components/admin/JsonEditor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function McpPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["mcp"],
    queryFn: api.listMcp,
  });
  const [editing, setEditing] = useState<McpRead | null>(null);
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: api.createMcp,
    onSuccess: () => {
      toast.success("Created");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["mcp"] });
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<McpRead> }) =>
      api.patchMcp(id, body),
    onSuccess: () => {
      toast.success("Updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["mcp"] });
    },
  });
  const del = useMutation({
    mutationFn: api.deleteMcp,
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["mcp"] });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-[var(--color-fg)]">MCP servers</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          + Add MCP
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{r.name}</span>
              <Badge tone={r.enabled ? "success" : "neutral"}>
                {r.enabled ? "enabled" : "disabled"}
              </Badge>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (confirm(`Delete MCP server "${r.name}"?`))
                      del.mutate(r.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
            <pre className="text-[10px] font-mono text-[var(--color-fg)]/70 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(r.config, null, 2)}
            </pre>
          </Card>
        ))}
        {rows.length === 0 && !creating && (
          <Card className="p-6 text-sm text-[var(--color-fg)]/60 col-span-full">
            No MCP servers configured.
          </Card>
        )}
      </div>

      {(creating || editing) && (
        <McpForm
          initial={editing}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(body) => {
            if (editing) patch.mutate({ id: editing.id, body });
            else create.mutate(body);
          }}
          busy={create.isPending || patch.isPending}
        />
      )}
    </div>
  );
}

function McpForm({
  initial,
  onCancel,
  onSubmit,
  busy,
}: {
  initial: McpRead | null;
  onCancel: () => void;
  onSubmit: (body: { name: string; config: Record<string, unknown>; enabled: boolean }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [config, setConfig] = useState<Record<string, unknown>>(
    initial?.config ?? { transport: "stdio", command: "", args: [] },
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium text-sm">
        {initial ? "Edit MCP server" : "New MCP server"}
      </div>
      <div className="space-y-1">
        <label className="text-xs text-[var(--color-fg)]/70">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled
      </label>
      <div className="space-y-1">
        <label className="text-xs text-[var(--color-fg)]/70">
          Transport / command / args (JSON)
        </label>
        <JsonEditor value={config} onChange={(v) => setConfig(v as Record<string, unknown>)} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit({ name, config, enabled })}
          disabled={busy || !name.trim()}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
