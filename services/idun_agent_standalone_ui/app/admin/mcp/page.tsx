"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type McpRead, api } from "@/lib/api";
import { YamlEditor } from "@/components/admin/YamlEditor";
import { BadgeTone } from "@/components/ui/badge-tone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const TRANSPORTS = ["stdio", "streamable_http", "sse", "websocket"] as const;
type Transport = (typeof TRANSPORTS)[number];

type McpForm = {
  name: string;
  enabled: boolean;
  transport: Transport;
  command: string;
  args: string;
  url: string;
  headers: Record<string, string>;
};

function readForm(initial: McpRead | null): McpForm {
  const config = (initial?.config ?? {}) as Record<string, unknown>;
  const transport = (config.transport as Transport | undefined) ?? "stdio";
  return {
    name: initial?.name ?? "",
    enabled: initial?.enabled ?? true,
    transport,
    command: String(config.command ?? ""),
    args: Array.isArray(config.args)
      ? (config.args as string[]).join(" ")
      : String(config.args ?? ""),
    url: String(config.url ?? ""),
    headers:
      (config.headers as Record<string, string> | undefined) ?? {},
  };
}

function writeForm(f: McpForm): {
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
} {
  const config: Record<string, unknown> = { transport: f.transport };
  if (f.transport === "stdio") {
    if (f.command) config.command = f.command;
    if (f.args.trim())
      config.args = f.args.split(/\s+/).filter(Boolean);
  } else {
    if (f.url) config.url = f.url;
    if (Object.keys(f.headers).length > 0) config.headers = f.headers;
  }
  return { name: f.name, config, enabled: f.enabled };
}

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
        {rows.map((r) => {
          const status = (r as McpRead & { status?: string }).status;
          const transport =
            (r.config?.transport as string | undefined) ?? "stdio";
          return (
            <Card key={r.id} className="p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{r.name}</span>
                <BadgeTone tone="info">{transport}</BadgeTone>
                <BadgeTone tone={r.enabled ? "success" : "neutral"}>
                  {r.enabled ? "enabled" : "disabled"}
                </BadgeTone>
                {status === "failed" && <BadgeTone tone="danger">failed</BadgeTone>}
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(r)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
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
          );
        })}
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
  onSubmit: (body: {
    name: string;
    config: Record<string, unknown>;
    enabled: boolean;
  }) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<McpForm>(readForm(initial));

  const stdio = form.transport === "stdio";

  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium text-sm">
        {initial ? "Edit MCP server" : "New MCP server"}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/70">Name</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/70">
            Transport
          </label>
          <select
            value={form.transport}
            onChange={(e) =>
              setForm({ ...form, transport: e.target.value as Transport })
            }
            className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm"
          >
            {TRANSPORTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        Enabled
      </label>
      {stdio ? (
        <>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">Command</label>
            <Input
              value={form.command}
              onChange={(e) =>
                setForm({ ...form, command: e.target.value })
              }
              placeholder="npx"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Args (space-separated)
            </label>
            <Input
              value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })}
              placeholder="-y @modelcontextprotocol/server-filesystem ./data"
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">URL</label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/mcp"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70">
              Headers (YAML map)
            </label>
            <YamlEditor
              value={form.headers}
              rows={4}
              onChange={(v) =>
                setForm({
                  ...form,
                  headers: (v ?? {}) as Record<string, string>,
                })
              }
            />
          </div>
        </>
      )}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit(writeForm(form))}
          disabled={busy || !form.name.trim()}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
