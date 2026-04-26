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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api";

type Provider =
  | "LANGFUSE"
  | "PHOENIX"
  | "LANGSMITH"
  | "GCP_LOGGING"
  | "GCP_TRACE";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "LANGFUSE", label: "Langfuse" },
  { id: "PHOENIX", label: "Phoenix" },
  { id: "LANGSMITH", label: "LangSmith" },
  { id: "GCP_LOGGING", label: "GCP Logging" },
  { id: "GCP_TRACE", label: "GCP Trace" },
];

const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as [Provider, ...Provider[]];

const providerSchema = z.object({
  enabled: z.boolean(),
  public_key: z.string(),
  secret_key: z.string(),
  host: z.string(),
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

function configToValues(
  enabled: boolean,
  config: Record<string, unknown>,
): ProviderValues {
  // Map across provider naming variants so existing payloads round-trip.
  const publicKey =
    typeof config.public_key === "string"
      ? (config.public_key as string)
      : typeof config.api_key === "string"
        ? (config.api_key as string)
        : "";
  const secretKey =
    typeof config.secret_key === "string" ? (config.secret_key as string) : "";
  const host =
    typeof config.host === "string"
      ? (config.host as string)
      : typeof config.endpoint === "string"
        ? (config.endpoint as string)
        : typeof config.collector_endpoint === "string"
          ? (config.collector_endpoint as string)
          : "";
  return { enabled, public_key: publicKey, secret_key: secretKey, host };
}

function valuesToConfig(
  provider: Provider,
  values: ProviderValues,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  // LangSmith historically used `api_key`/`endpoint`; keep that shape.
  if (provider === "LANGSMITH") {
    out.api_key = values.public_key;
    out.endpoint = values.host;
    delete out.public_key;
    delete out.host;
  } else if (provider === "PHOENIX") {
    out.collector_endpoint = values.host;
    delete out.host;
    out.public_key = values.public_key;
    out.secret_key = values.secret_key;
  } else {
    out.host = values.host;
    out.public_key = values.public_key;
    out.secret_key = values.secret_key;
  }
  return out;
}

export default function ObservabilityPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["observability"],
    queryFn: api.getObservability,
  });

  const initial = useMemo(() => readObs(data?.config), [data]);
  const [activeProvider, setActiveProvider] = useState<Provider>(
    initial.provider,
  );
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    setActiveProvider(initial.provider);
  }, [initial.provider]);

  const initialValues = useMemo(
    () => configToValues(initial.enabled, initial.config),
    [initial],
  );

  const form = useForm<ProviderValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      api.putObservability({ config: next }),
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) {
        setRestartRequired(true);
        toast.warning("Restart required to apply this change.");
      } else {
        setRestartRequired(false);
        toast.success("Saved & reloaded");
      }
      qc.invalidateQueries({ queryKey: ["observability"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const handleSubmit = (values: ProviderValues) => {
    // Keep any provider-specific extras the backend already had.
    const base =
      activeProvider === initial.provider ? { ...initial.config } : {};
    const config = valuesToConfig(activeProvider, values, base);
    save.mutate({
      provider: activeProvider,
      enabled: values.enabled,
      config,
    });
  };

  const handleProviderChange = (next: Provider) => {
    setActiveProvider(next);
    if (next === initial.provider) {
      form.reset(initialValues);
    } else {
      form.reset({ enabled: true, public_key: "", secret_key: "", host: "" });
    }
  };

  const yamlText = useMemo(() => {
    const values = form.getValues();
    const base =
      activeProvider === initial.provider ? { ...initial.config } : {};
    return stringifyYaml({
      provider: activeProvider,
      enabled: values.enabled,
      config: valuesToConfig(activeProvider, values, base),
    });
  }, [activeProvider, form, initial, yamlOpen]);

  const persistFromYaml = async (parsed: unknown) => {
    const next = readObs(parsed);
    setActiveProvider(next.provider);
    form.reset(configToValues(next.enabled, next.config));
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
        <CardContent>
          <Tabs
            value={activeProvider}
            onValueChange={(t) => handleProviderChange(t as Provider)}
          >
            <TabsList>
              {PROVIDERS.map((p) => (
                <TabsTrigger key={p.id} value={p.id}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {PROVIDERS.map((p) => (
              <TabsContent key={p.id} value={p.id} className="mt-4">
                <Form {...form}>
                  <form
                    id={`obs-form-${p.id}`}
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
                                p.id === "LANGFUSE"
                                  ? "https://cloud.langfuse.com"
                                  : p.id === "PHOENIX"
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
                            {p.id === "LANGSMITH" ? "API key" : "Public key"}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {p.id !== "LANGSMITH" && (
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
              </TabsContent>
            ))}
          </Tabs>
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
