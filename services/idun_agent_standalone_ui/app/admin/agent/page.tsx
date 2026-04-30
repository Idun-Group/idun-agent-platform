"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, type AgentRead, api } from "@/lib/api";

const AgentGraph = dynamic(
  () => import("@/components/graph/AgentGraph").then((m) => m.AgentGraph),
  {
    ssr: false,
    loading: () => (
      <div className="h-[480px] animate-pulse rounded-md bg-muted" />
    ),
  },
);

type Framework = "langgraph" | "adk";
const FRAMEWORKS: Framework[] = ["langgraph", "adk"];

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

  const initialFramework = useMemo(() => readFramework(data), [data]);
  const [activeTab, setActiveTab] = useState<Framework>(initialFramework);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

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
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">Agent</h1>
        <p className="text-sm text-muted-foreground">
          Identity and graph definition for the running agent. Memory is configured
          on its own page.
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
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Pick the agent framework and edit its definition. Switching frameworks
            is a structural change and requires a restart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(t) => setActiveTab(t as Framework)}
          >
            <TabsList>
              {FRAMEWORKS.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {f === "langgraph" ? "LangGraph" : "ADK"}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
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
            </TabsContent>
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
          <Button type="submit" form="agent-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent graph</CardTitle>
          <CardDescription>
            A visual map of this agent&apos;s sub-agents and tools.
          </CardDescription>
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
          {graphQuery.data && <AgentGraph graph={graphQuery.data} height={480} />}
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
