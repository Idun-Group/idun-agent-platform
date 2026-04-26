"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type IntegrationRead, api } from "@/lib/api";
import { JsonEditor } from "@/components/admin/JsonEditor";
import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";
import { BadgeTone } from "@/components/ui/badge-tone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const KINDS = ["whatsapp", "discord"] as const;

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: api.listIntegrations,
  });
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: api.createIntegration,
    onSuccess: () => {
      toast.success("Created");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<IntegrationRead> }) =>
      api.patchIntegration(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
  const del = useMutation({
    mutationFn: api.deleteIntegration,
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Integrations</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          + Add integration
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <BadgeTone tone="info">{r.kind}</BadgeTone>
              <BadgeTone tone={r.enabled ? "success" : "neutral"}>
                {r.enabled ? "enabled" : "disabled"}
              </BadgeTone>
              <div className="ml-auto flex gap-2 items-center">
                <span
                  title="Test webhook is part of MVP-2 (engine has no test_connection yet)."
                  className="flex items-center gap-1"
                >
                  <Button size="sm" variant="ghost" disabled>
                    Test webhook
                  </Button>
                  <ComingSoonBadge variant="preview" />
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch.mutate({ id: r.id, body: { enabled: !r.enabled } })}
                >
                  {r.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`Delete ${r.kind} integration?`)) del.mutate(r.id);
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
            No integrations configured.
          </Card>
        )}
      </div>

      {creating && (
        <NewIntegrationForm
          onCancel={() => setCreating(false)}
          onSubmit={(body) => create.mutate(body)}
          busy={create.isPending}
        />
      )}
    </div>
  );
}

function NewIntegrationForm({
  onCancel,
  onSubmit,
  busy,
}: {
  onCancel: () => void;
  onSubmit: (body: { kind: string; config: Record<string, unknown>; enabled: boolean }) => void;
  busy: boolean;
}) {
  const [kind, setKind] = useState<(typeof KINDS)[number]>("whatsapp");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(false);
  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium text-sm">New integration</div>
      <div className="space-y-1">
        <label className="text-xs text-[var(--color-fg)]/70">Kind</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
          className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
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
          Configuration (JSON)
        </label>
        <JsonEditor value={config} onChange={(v) => setConfig(v as Record<string, unknown>)} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit({ kind, config, enabled })}
          disabled={busy}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
