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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, type AgentRead, api } from "@/lib/api";

type Framework = "langgraph" | "adk";
const FRAMEWORKS: Framework[] = ["langgraph", "adk"];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  graphDefinition: z.string().min(1, "Graph definition is required"),
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

function readGraphDefinition(data: AgentRead | undefined): string {
  const cfg = readAgentSlice(data).config ?? {};
  const v = cfg["graph_definition"];
  return typeof v === "string" ? v : "";
}

function buildBaseEngineConfig(
  base: Record<string, unknown> | undefined,
  framework: Framework,
  graphDefinition: string,
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
  next.agent = {
    ...agent,
    type: framework === "adk" ? "ADK" : "LANGGRAPH",
    config: { ...config, graph_definition: graphDefinition },
  };
  return next;
}

export default function AgentPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent"],
    queryFn: api.getAgent,
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
      graphDefinition: readGraphDefinition(data),
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
          values.graphDefinition,
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
        v.graphDefinition,
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
    const graphDefinition =
      typeof agentSlice?.config?.["graph_definition"] === "string"
        ? (agentSlice.config["graph_definition"] as string)
        : "";

    form.reset({
      name: obj.name ?? "",
      description: obj.description ?? "",
      graphDefinition,
    });
    setActiveTab(framework);
    save.mutate({
      name: obj.name ?? "",
      description: obj.description ?? "",
      graphDefinition,
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
                    name="graphDefinition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Graph definition</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={
                              activeTab === "langgraph"
                                ? "./agent.py:graph"
                                : "./agent.py:agent"
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
