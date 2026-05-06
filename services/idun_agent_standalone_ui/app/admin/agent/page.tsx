"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EditYamlSheet } from "@/components/admin/EditYamlSheet";
import { ProviderPicker } from "@/components/admin/ProviderPicker";
import {
  AdkIcon,
  LangGraphIcon,
} from "@/components/admin/provider-icons";
import {
  AgentGraphLazy,
  type AgentGraphHandle,
} from "@/components/graph/AgentGraphLazy";
import { ExportMenu } from "@/components/graph/ExportMenu";
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
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { ApiError, type AgentRead, api } from "@/lib/api";

type Framework = "langgraph" | "adk";

const FRAMEWORK_OPTIONS = [
  {
    id: "langgraph" as const,
    label: "LangGraph",
    description: "Graph-based orchestration. The default for most agents.",
    icon: <LangGraphIcon size={44} />,
  },
  {
    id: "adk" as const,
    label: "ADK",
    description: "Google Agent Development Kit. Vertex-friendly.",
    icon: <AdkIcon size={44} />,
  },
];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  definition: z.string().min(1, "Definition is required"),
});

type FormValues = z.infer<typeof formSchema>;

type AgentSlice = {
  type?: string;
  config?: Record<string, unknown>;
};

function readAgentSlice(data: AgentRead | undefined): AgentSlice {
  const base = (data?.baseEngineConfig ?? {}) as Record<string, unknown>;
  return (base.agent as AgentSlice | undefined) ?? {};
}

function readFramework(data: AgentRead | undefined): Framework {
  const t = readAgentSlice(data).type;
  return t === "ADK" ? "adk" : "langgraph";
}

function definitionKey(framework: Framework): "graph_definition" | "agent" {
  return framework === "adk" ? "agent" : "graph_definition";
}

function readDefinition(data: AgentRead | undefined): string {
  const framework = readFramework(data);
  const cfg = readAgentSlice(data).config ?? {};
  const v = cfg[definitionKey(framework)];
  return typeof v === "string" ? v : "";
}

function buildBaseEngineConfig(
  base: Record<string, unknown> | undefined,
  framework: Framework,
  definition: string,
  name: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(base ?? {}) };
  const agent = ((next.agent as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    unknown
  >;
  const config = ((agent.config as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    unknown
  >;
  const innerKey = definitionKey(framework);
  const nextConfig: Record<string, unknown> = { ...config, [innerKey]: definition };
  // ADK derives app_name from the agent name when missing.
  if (framework === "adk" && !nextConfig.app_name) {
    nextConfig.app_name = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "agent";
  }
  // Drop the other framework's key so we don't leave dead config.
  delete nextConfig[
    framework === "adk" ? "graph_definition" : "agent"
  ];
  next.agent = {
    ...agent,
    type: framework === "adk" ? "ADK" : "LANGGRAPH",
    config: nextConfig,
  };
  return next;
}

export default function AgentPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent"],
    queryFn: api.getAgent,
  });

  const graphQuery = useQuery({
    queryKey: ["admin-agent-graph"],
    queryFn: () => api.getAgentGraph(),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  const graphRef = useRef<AgentGraphHandle | null>(null);

  const initialFramework = useMemo(() => readFramework(data), [data]);
  const [activeTab, setActiveTab] = useState<Framework>(initialFramework);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  type VerifyStatus = "idle" | "checking" | "connected" | "failed";
  const VERIFY_MAX_ATTEMPTS = 4;
  const VERIFY_INTERVAL_MS = 5000;
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const verifyAbort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      verifyAbort.current?.abort();
    },
    [],
  );

  async function verifyConnection() {
    verifyAbort.current?.abort();
    const controller = new AbortController();
    verifyAbort.current = controller;
    setVerifyStatus("checking");
    setVerifyError(null);
    setVerifiedName(null);

    for (let i = 0; i < VERIFY_MAX_ATTEMPTS; i++) {
      if (controller.signal.aborted) return;
      setVerifyAttempt(i + 1);
      try {
        const health = await api.checkAgentHealth();
        if (controller.signal.aborted) return;
        if (health.status === "ok") {
          setVerifiedName(health.agent_name ?? null);
          setVerifyStatus("connected");
          return;
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        const detail =
          e instanceof ApiError
            ? ((e.detail as { error?: { message?: string } } | undefined)
                ?.error?.message ?? `Engine returned ${e.status}.`)
            : e instanceof Error
              ? e.message
              : "Unreachable.";
        setVerifyError(detail);
      }
      if (i < VERIFY_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, VERIFY_INTERVAL_MS),
        );
      }
    }
    if (!controller.signal.aborted) setVerifyStatus("failed");
  }

  useEffect(() => {
    setActiveTab(initialFramework);
  }, [initialFramework]);

  const initialValues: FormValues = useMemo(
    () => ({
      name: data?.name ?? "",
      description: data?.description ?? "",
      definition: readDefinition(data),
    }),
    [data],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  const save = useMutation({
    mutationFn: (values: FormValues & { framework: Framework }) =>
      api.patchAgent({
        name: values.name,
        description: values.description || null,
        baseEngineConfig: buildBaseEngineConfig(
          data?.baseEngineConfig,
          values.framework,
          values.definition,
          values.name,
        ),
      }),
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
      qc.invalidateQueries({ queryKey: ["agent"] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { error?: { message?: string } } | undefined)?.error
        ?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const handleSubmit = (values: FormValues) => {
    save.mutate({ ...values, framework: activeTab });
  };

  useBeforeUnload(form.formState.isDirty);

  const yamlText = useMemo(() => {
    if (!data) return "";
    const v = form.getValues();
    return stringifyYaml({
      name: v.name,
      description: v.description,
      baseEngineConfig: buildBaseEngineConfig(
        data.baseEngineConfig,
        activeTab,
        v.definition,
        v.name,
      ),
    });
  }, [data, activeTab, form, yamlOpen]);

  const persistFromYaml = async (parsed: unknown) => {
    const obj = (parsed ?? {}) as {
      name?: string;
      description?: string | null;
      baseEngineConfig?: Record<string, unknown>;
    };
    const base = obj.baseEngineConfig ?? data?.baseEngineConfig ?? {};
    const agentSlice = (base as Record<string, unknown>).agent as
      | { type?: string; config?: Record<string, unknown> }
      | undefined;
    const framework: Framework = agentSlice?.type === "ADK" ? "adk" : "langgraph";
    const innerKey = framework === "adk" ? "agent" : "graph_definition";
    const definition =
      typeof agentSlice?.config?.[innerKey] === "string"
        ? (agentSlice.config[innerKey] as string)
        : "";

    form.reset({
      name: obj.name ?? "",
      description: obj.description ?? "",
      definition,
    });
    setActiveTab(framework);
    save.mutate({
      name: obj.name ?? "",
      description: obj.description ?? "",
      definition,
      framework,
    });
  };

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <AdminPageHeader
        title="Agent"
        description="Identity and graph definition for the running agent. Memory is configured on its own page."
        docsHref="https://docs.idunplatform.com/standalone/agent"
        isDirty={form.formState.isDirty}
      />

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
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="space-y-1">
            <CardTitle>Connection</CardTitle>
            <CardDescription>
              Probe the engine&apos;s health endpoint. Useful after a restart or
              a config change.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={verifyConnection}
            disabled={verifyStatus === "checking"}
          >
            {verifyStatus === "checking" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <Wifi className="mr-2 h-4 w-4" />
                Verify connection
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {verifyStatus === "idle" && (
            <p className="text-sm text-muted-foreground">
              Click <em>Verify connection</em> to probe <code>/health</code>.
            </p>
          )}
          {verifyStatus === "checking" && (
            <p className="text-sm text-muted-foreground italic">
              Attempt {verifyAttempt} of {VERIFY_MAX_ATTEMPTS}, retrying every{" "}
              {VERIFY_INTERVAL_MS / 1000}s…
            </p>
          )}
          {verifyStatus === "connected" && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <Wifi />
              <AlertTitle>Agent is healthy</AlertTitle>
              <AlertDescription>
                {verifiedName
                  ? `Engine reports the running agent as "${verifiedName}".`
                  : "Engine is responsive."}
              </AlertDescription>
            </Alert>
          )}
          {verifyStatus === "failed" && (
            <Alert variant="destructive">
              <WifiOff />
              <AlertTitle>Could not reach the agent</AlertTitle>
              <AlertDescription>
                {verifyError ??
                  `No response after ${VERIFY_MAX_ATTEMPTS} attempts. Make sure the engine is running.`}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Pick the agent framework and edit its definition. Switching frameworks
            is a structural change and requires a restart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProviderPicker
            value={activeTab}
            onChange={(t) => setActiveTab(t)}
            options={FRAMEWORK_OPTIONS}
            columns={2}
          />

          <Form {...form}>
            <form
              id="agent-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="definition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {activeTab === "adk" ? "Agent definition" : "Graph definition"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={
                          activeTab === "adk"
                            ? "./agent/agent.py:root_agent"
                            : "./agent.py:graph"
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Module path and attribute, separated by a colon.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
          <Button type="submit" form="agent-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1.5">
            <CardTitle>Agent graph</CardTitle>
            <CardDescription>
              A visual map of this agent&apos;s sub-agents and tools.
            </CardDescription>
          </div>
          <ExportMenu
            graphRef={graphRef}
            agentName={data?.name ?? "agent"}
            disabled={
              graphQuery.isLoading || graphQuery.isError || !graphQuery.data
            }
          />
        </CardHeader>
        <CardContent>
          {graphQuery.isLoading && (
            <div className="h-[480px] animate-pulse rounded-md bg-muted" />
          )}
          {graphQuery.isError &&
            graphQuery.error instanceof ApiError &&
            graphQuery.error.status === 404 && (
              <p className="text-sm text-muted-foreground">
                Graph view isn&apos;t available for this agent type yet.
              </p>
            )}
          {graphQuery.isError &&
            !(
              graphQuery.error instanceof ApiError &&
              graphQuery.error.status === 404
            ) && (
              <Alert>
                <AlertTitle>Graph unavailable</AlertTitle>
                <AlertDescription>Try reloading the page.</AlertDescription>
              </Alert>
            )}
          {graphQuery.data && (
            <AgentGraphLazy ref={graphRef} graph={graphQuery.data} height={480} />
          )}
        </CardContent>
      </Card>

      <EditYamlSheet
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlText}
        onSave={persistFromYaml}
        title="Edit agent YAML"
        description="Update the full agent payload. Save persists immediately."
      />
    </div>
  );
}
