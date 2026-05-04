"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { EditYamlSheet } from "@/components/admin/EditYamlSheet";
import { ProviderPicker } from "@/components/admin/ProviderPicker";
import {
  GcpLoggingIcon,
  GcpTraceIcon,
  LangfuseIcon,
  LangSmithIcon,
  PhoenixIcon,
} from "@/components/admin/provider-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api";

type Provider =
  | "LANGFUSE"
  | "PHOENIX"
  | "LANGSMITH"
  | "GCP_LOGGING"
  | "GCP_TRACE";

const PROVIDERS: {
  id: Provider;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "LANGFUSE",
    label: "Langfuse",
    description: "Open-source LLM observability. Hosted or self-hosted.",
    icon: <LangfuseIcon size={44} />,
  },
  {
    id: "PHOENIX",
    label: "Phoenix",
    description: "Arize Phoenix. OTLP collector with rich tracing UI.",
    icon: <PhoenixIcon size={44} />,
  },
  {
    id: "LANGSMITH",
    label: "LangSmith",
    description: "LangChain's hosted tracing and evaluation suite.",
    icon: <LangSmithIcon size={44} />,
  },
  {
    id: "GCP_LOGGING",
    label: "GCP Logging",
    description: "Forward structured logs to Google Cloud Logging.",
    icon: <GcpLoggingIcon size={44} />,
  },
  {
    id: "GCP_TRACE",
    label: "GCP Trace",
    description: "Send spans to Google Cloud Trace.",
    icon: <GcpTraceIcon size={44} />,
  },
];

const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as [Provider, ...Provider[]];

const providerSchema = z.object({
  enabled: z.boolean(),
  // Langfuse + Phoenix fields
  host: z.string().optional().default(""),
  public_key: z.string().optional().default(""),
  secret_key: z.string().optional().default(""),
  // LangSmith fields
  api_key: z.string().optional().default(""),
  endpoint: z.string().optional().default(""),
  project_name: z.string().optional().default(""),
  // GCP shared
  project_id: z.string().optional().default(""),
  region: z.string().optional().default(""),
  // GCP Logging
  log_name: z.string().optional().default(""),
  resource_type: z.string().optional().default(""),
  severity: z.string().optional().default("INFO"),
  // GCP Trace
  trace_name: z.string().optional().default(""),
  sampling_rate: z.number().min(0).max(1).optional().default(1.0),
  flush_interval: z.number().int().min(0).optional().default(5),
  ignore_urls: z.string().optional().default(""),
});

type ProviderValues = z.infer<typeof providerSchema>;

type ObsConfig = {
  provider: Provider;
  enabled: boolean;
  config: Record<string, unknown>;
};

function readObs(raw: unknown): ObsConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const providerRaw = obj.provider;
  const provider: Provider = (PROVIDER_IDS as readonly string[]).includes(
    String(providerRaw),
  )
    ? (providerRaw as Provider)
    : "LANGFUSE";
  const enabled = obj.enabled === undefined ? true : Boolean(obj.enabled);
  const config =
    (obj.config as Record<string, unknown> | undefined) ?? {};
  return { provider, enabled, config };
}

function emptyValues(): ProviderValues {
  return {
    enabled: true,
    host: "",
    public_key: "",
    secret_key: "",
    api_key: "",
    endpoint: "",
    project_name: "",
    project_id: "",
    region: "",
    log_name: "",
    resource_type: "",
    severity: "INFO",
    trace_name: "",
    sampling_rate: 1.0,
    flush_interval: 5,
    ignore_urls: "",
  };
}

function configToValues(
  provider: Provider,
  enabled: boolean,
  config: Record<string, unknown>,
): ProviderValues {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const base = emptyValues();
  base.enabled = enabled;

  if (provider === "LANGFUSE") {
    base.host = str(config.host);
    base.public_key = str(config.publicKey) || str(config.public_key);
    base.secret_key = str(config.secretKey) || str(config.secret_key);
  } else if (provider === "PHOENIX") {
    base.host =
      str(config.collectorEndpoint) || str(config.collector_endpoint);
    base.project_name = str(config.projectName) || str(config.project_name);
  } else if (provider === "LANGSMITH") {
    base.api_key = str(config.apiKey) || str(config.api_key);
    base.endpoint = str(config.endpoint);
    base.project_name = str(config.projectName) || str(config.project_name);
  } else if (provider === "GCP_LOGGING") {
    base.project_id =
      str(config.gcpProjectId) || str(config.projectId) || str(config.project_id);
    base.region = str(config.region);
    base.log_name = str(config.logName) || str(config.log_name);
    base.resource_type =
      str(config.resourceType) || str(config.resource_type);
    base.severity = str(config.severity) || "INFO";
  } else if (provider === "GCP_TRACE") {
    base.project_id =
      str(config.gcpProjectId) || str(config.projectId) || str(config.project_id);
    base.region = str(config.region);
    base.trace_name = str(config.traceName) || str(config.trace_name);
    base.sampling_rate = num(
      (config.samplingRate ?? config.sampling_rate) as unknown,
      1.0,
    );
    base.flush_interval = num(
      (config.flushInterval ?? config.flush_interval) as unknown,
      5,
    );
    base.ignore_urls = str(config.ignoreUrls) || str(config.ignore_urls);
  }
  return base;
}

function valuesToConfig(
  provider: Provider,
  values: ProviderValues,
): Record<string, unknown> {
  if (provider === "LANGFUSE") {
    return {
      host: values.host,
      public_key: values.public_key,
      secret_key: values.secret_key,
    };
  }
  if (provider === "PHOENIX") {
    return {
      collector_endpoint: values.host,
      ...(values.project_name ? { project_name: values.project_name } : {}),
    };
  }
  if (provider === "LANGSMITH") {
    return {
      api_key: values.api_key,
      endpoint: values.endpoint,
      ...(values.project_name ? { project_name: values.project_name } : {}),
    };
  }
  if (provider === "GCP_LOGGING") {
    return {
      project_id: values.project_id,
      region: values.region,
      log_name: values.log_name,
      resource_type: values.resource_type,
      severity: values.severity || "INFO",
    };
  }
  // GCP_TRACE
  return {
    project_id: values.project_id,
    region: values.region,
    trace_name: values.trace_name,
    sampling_rate: values.sampling_rate,
    flush_interval: values.flush_interval,
    ...(values.ignore_urls ? { ignore_urls: values.ignore_urls } : {}),
  };
}

export default function ObservabilityPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["observability"],
    queryFn: api.getObservability,
  });

  const initial = useMemo(() => readObs(data?.observability), [data]);
  const [activeProvider, setActiveProvider] = useState<Provider>(
    initial.provider,
  );
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    setActiveProvider(initial.provider);
  }, [initial.provider]);

  const initialValues = useMemo(
    () => configToValues(initial.provider, initial.enabled, initial.config),
    [initial],
  );

  const form = useForm<ProviderValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  const save = useMutation({
    mutationFn: (next: ObsConfig) =>
      api.patchObservability({ observability: next }),
    onSuccess: (resp) => {
      if (resp.reload.status === "restart_required") {
        setRestartRequired(true);
        toast.warning(resp.reload.message);
      } else if (resp.reload.status === "reload_failed") {
        setRestartRequired(false);
        toast.error(resp.reload.error ?? resp.reload.message);
      } else {
        setRestartRequired(false);
        toast.success(resp.reload.message);
      }
      qc.invalidateQueries({ queryKey: ["observability"] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { error?: { message?: string } } | undefined)?.error
        ?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const handleSubmit = (values: ProviderValues) => {
    save.mutate({
      provider: activeProvider,
      enabled: values.enabled,
      config: valuesToConfig(activeProvider, values),
    });
  };

  const handleProviderChange = (next: Provider) => {
    setActiveProvider(next);
    if (next === initial.provider) {
      form.reset(initialValues);
    } else {
      const cleared = emptyValues();
      cleared.enabled = true;
      form.reset(cleared);
    }
  };

  const yamlText = useMemo(() => {
    const values = form.getValues();
    return stringifyYaml({
      provider: activeProvider,
      enabled: values.enabled,
      config: valuesToConfig(activeProvider, values),
    });
  }, [activeProvider, form, yamlOpen]);

  const persistFromYaml = async (parsed: unknown) => {
    const next = readObs(parsed);
    setActiveProvider(next.provider);
    form.reset(configToValues(next.provider, next.enabled, next.config));
    save.mutate({
      provider: next.provider,
      enabled: next.enabled,
      config: next.config,
    });
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Observability
        </h1>
        <p className="text-sm text-muted-foreground">
          Trace exporter for the running agent. Only one provider is active at
          a time.
        </p>
      </header>

      {restartRequired && (
        <Alert variant="destructive">
          <RotateCcw />
          <AlertTitle>Restart required</AlertTitle>
          <AlertDescription>
            Structural change detected — restart required to apply.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>
            Pick a backend and supply credentials. Switching providers replaces
            the active exporter on save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProviderPicker
            value={activeProvider}
            onChange={(t) => handleProviderChange(t as Provider)}
            options={PROVIDERS}
            columns={3}
          />

          <Form {...form}>
            <form
              id={`obs-form-${activeProvider}`}
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Enabled</FormLabel>
                      <FormDescription>
                        Toggle to start or stop exporting traces.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="host"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Host</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={
                          activeProvider === "LANGFUSE"
                            ? "https://cloud.langfuse.com"
                            : activeProvider === "PHOENIX"
                              ? "https://collector.phoenix.com"
                              : ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="public_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {activeProvider === "LANGSMITH" ? "API key" : "Public key"}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {activeProvider !== "LANGSMITH" && (
                <FormField
                  control={form.control}
                  name="secret_key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secret key</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-between">
          <Button
            variant="outline"
            type="button"
            onClick={() => setYamlOpen(true)}
          >
            Edit YAML
          </Button>
          <Button
            type="submit"
            form={`obs-form-${activeProvider}`}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>

      <EditYamlSheet
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlText}
        onSave={persistFromYaml}
        title="Edit observability YAML"
        description="Update the full observability payload."
      />
    </div>
  );
}
