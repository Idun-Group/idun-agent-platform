"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { SaveToolbar } from "@/components/admin/SaveToolbar";
import { YamlEditor } from "@/components/admin/YamlEditor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Provider = "LANGFUSE" | "PHOENIX" | "GCP_LOGGING" | "GCP_TRACE" | "LANGSMITH";

type ObsForm = {
  provider: Provider;
  enabled: boolean;
  config: Record<string, unknown>;
};

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "LANGFUSE", label: "Langfuse" },
  { id: "PHOENIX", label: "Arize Phoenix" },
  { id: "GCP_LOGGING", label: "GCP Logging" },
  { id: "GCP_TRACE", label: "GCP Trace" },
  { id: "LANGSMITH", label: "LangSmith" },
];

const DEFAULT_CONFIG: Record<Provider, Record<string, unknown>> = {
  LANGFUSE: {
    host: "https://cloud.langfuse.com",
    public_key: "",
    secret_key: "",
    run_name: "",
  },
  PHOENIX: {
    collector_endpoint: "https://collector.phoenix.com",
    project_name: "",
  },
  GCP_LOGGING: {
    project_id: "",
    region: "",
    log_name: "",
    resource_type: "",
    severity: "INFO",
    transport: "BackgroundThread",
  },
  GCP_TRACE: {
    project_id: "",
    region: "",
    trace_name: "",
    sampling_rate: 1.0,
    flush_interval: 5,
    ignore_urls: "",
  },
  LANGSMITH: {
    api_key: "",
    project_name: "",
    endpoint: "",
    run_name: "",
  },
};

function configToForm(raw: Record<string, unknown> | undefined): ObsForm {
  const provider = (raw?.provider as Provider | undefined) ?? "LANGFUSE";
  const enabled = raw?.enabled === undefined ? true : Boolean(raw.enabled);
  const config =
    (raw?.config as Record<string, unknown> | undefined) ??
    DEFAULT_CONFIG[provider];
  return { provider, enabled, config };
}

function formToConfig(f: ObsForm): Record<string, unknown> {
  return { provider: f.provider, enabled: f.enabled, config: f.config };
}

function ProviderFields({
  provider,
  config,
  setConfig,
}: {
  provider: Provider;
  config: Record<string, unknown>;
  setConfig: (next: Record<string, unknown>) => void;
}) {
  const text = (key: string, label: string, placeholder?: string, type: "text" | "password" = "text") => (
    <div className="space-y-1" key={key}>
      <label className="text-xs text-[var(--color-fg)]/70">{label}</label>
      <Input
        type={type}
        value={String(config[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
      />
    </div>
  );
  const num = (key: string, label: string, step = 0.1) => (
    <div className="space-y-1" key={key}>
      <label className="text-xs text-[var(--color-fg)]/70">{label}</label>
      <Input
        type="number"
        step={step}
        value={String(config[key] ?? "")}
        onChange={(e) =>
          setConfig({ ...config, [key]: Number(e.target.value) })
        }
      />
    </div>
  );

  switch (provider) {
    case "LANGFUSE":
      return (
        <>
          {text("host", "Host", "https://cloud.langfuse.com")}
          {text("public_key", "Public key")}
          {text("secret_key", "Secret key", "", "password")}
          {text("run_name", "Run name (optional)")}
        </>
      );
    case "PHOENIX":
      return (
        <>
          {text("collector_endpoint", "Collector endpoint", "https://collector.phoenix.com")}
          {text("project_name", "Project name")}
        </>
      );
    case "GCP_LOGGING":
      return (
        <>
          {text("project_id", "GCP project ID")}
          {text("region", "Region (optional)")}
          {text("log_name", "Log name")}
          {text("resource_type", "Resource type", "global / gce_instance / cloud_run_revision")}
          {text("severity", "Severity", "INFO")}
          {text("transport", "Transport", "BackgroundThread")}
        </>
      );
    case "GCP_TRACE":
      return (
        <>
          {text("project_id", "GCP project ID")}
          {text("region", "Region (optional)")}
          {text("trace_name", "Trace name")}
          {num("sampling_rate", "Sampling rate (0–1)", 0.05)}
          {num("flush_interval", "Flush interval (s)", 1)}
          {text("ignore_urls", "Ignore URLs (comma-separated)")}
        </>
      );
    case "LANGSMITH":
      return (
        <>
          {text("api_key", "API key", "", "password")}
          {text("project_name", "Project name")}
          {text("endpoint", "Endpoint (self-hosted only)")}
          {text("run_name", "Run name (optional)")}
        </>
      );
  }
}

export default function ObservabilityPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["observability"],
    queryFn: api.getObservability,
  });
  const [form, setForm] = useState<ObsForm>(configToForm(undefined));
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
      api.putObservability({ config: next }),
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) toast.warning("Restart required to apply.");
      else toast.success("Saved & reloaded");
      qc.invalidateQueries({ queryKey: ["observability"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  if (isLoading) return <div className="p-6">Loading…</div>;

  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  return (
    <>
      <SaveToolbar
        title="Observability"
        dirty={dirty}
        busy={save.isPending}
        onRevert={() => setForm(initialForm)}
        onSave={() => save.mutate(formToConfig(form))}
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
            Provider
          </div>
          <div className="flex gap-2 flex-wrap">
            {PROVIDERS.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() =>
                  setForm({
                    ...form,
                    provider: p.id,
                    config:
                      form.provider === p.id ? form.config : DEFAULT_CONFIG[p.id],
                  })
                }
                className={`px-3 py-1 rounded-md border text-sm ${
                  form.provider === p.id
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-fg)]/70 hover:bg-[var(--color-muted)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
        </Card>

        <Card className="p-4 grid grid-cols-2 gap-3">
          <ProviderFields
            provider={form.provider}
            config={form.config}
            setConfig={(c) => setForm({ ...form, config: c })}
          />
        </Card>

        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/50 mb-2">
            {editYaml ? "YAML editor" : "YAML preview"}
          </div>
          <YamlEditor
            value={formToConfig(form)}
            readOnly={!editYaml}
            onChange={(v) =>
              setForm(configToForm(v as Record<string, unknown>))
            }
          />
        </div>
      </div>
    </>
  );
}
