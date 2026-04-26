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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, type AgentRead, api } from "@/lib/api";

type Framework = "langgraph" | "adk";
const FRAMEWORKS: Framework[] = ["langgraph", "adk"];

const checkpointerTypeSchema = z.enum(["memory", "sqlite", "postgres"]);

const langgraphSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    graph_definition: z.string().min(1, "Graph definition is required"),
    checkpointer_type: checkpointerTypeSchema,
    checkpointer_url: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.checkpointer_type === "memory") return;
    if (!data.checkpointer_url.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpointer_url"],
        message: "Checkpointer URL is required",
      });
      return;
    }
    if (
      data.checkpointer_type === "sqlite" &&
      !data.checkpointer_url.startsWith("sqlite:///")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpointer_url"],
        message: "SQLite URL must start with sqlite:///",
      });
    }
    if (
      data.checkpointer_type === "postgres" &&
      !(
        data.checkpointer_url.startsWith("postgresql://") ||
        data.checkpointer_url.startsWith("postgres://")
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpointer_url"],
        message: "Postgres URL must start with postgresql:// or postgres://",
      });
    }
  });

const adkSchema = z.object({
  name: z.string().min(1, "Name is required"),
  graph_definition: z.string().min(1, "Definition is required"),
});

type LanggraphValues = z.infer<typeof langgraphSchema>;
type AdkValues = z.infer<typeof adkSchema>;

function readCheckpointer(
  config: Record<string, unknown> | undefined,
): { type: "memory" | "sqlite" | "postgres"; url: string } {
  const cp = (config?.checkpointer as Record<string, unknown> | undefined) ?? {};
  const rawType =
    typeof cp.type === "string" ? (cp.type as string) : "memory";
  const type =
    rawType === "sqlite" || rawType === "postgres" ? rawType : "memory";
  // Engine accepts either `db_url` (current standalone shape) or `url`.
  let url = "";
  if (typeof cp.db_url === "string") url = cp.db_url as string;
  else if (typeof cp.url === "string") url = cp.url as string;
  return { type, url };
}

function buildAgentBody(
  framework: Framework,
  values: LanggraphValues | AdkValues,
  baseConfig: Record<string, unknown> | undefined,
) {
  const config: Record<string, unknown> = { ...(baseConfig ?? {}) };
  if (framework === "langgraph") {
    const v = values as LanggraphValues;
    if (v.checkpointer_type === "memory") {
      config.checkpointer = { type: "memory" };
    } else {
      config.checkpointer = {
        type: v.checkpointer_type,
        db_url: v.checkpointer_url,
      };
    }
  } else {
    // ADK: leave any existing config keys intact; the form here only edits
    // identity + graph definition. `checkpointer` stays as-is.
  }
  return {
    name: values.name,
    framework,
    graph_definition: values.graph_definition,
    config,
  };
}

export default function AgentPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent"],
    queryFn: api.getAgent,
  });

  const initialFramework: Framework = useMemo(() => {
    const fw = data?.framework;
    return fw === "adk" ? "adk" : "langgraph";
  }, [data?.framework]);

  const [activeTab, setActiveTab] = useState<Framework>(initialFramework);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    setActiveTab(initialFramework);
  }, [initialFramework]);

  const initialLanggraph: LanggraphValues = useMemo(() => {
    const cp = readCheckpointer(data?.config);
    return {
      name: data?.name ?? "",
      graph_definition: data?.graph_definition ?? "",
      checkpointer_type: cp.type,
      checkpointer_url: cp.url,
    };
  }, [data]);

  const initialAdk: AdkValues = useMemo(
    () => ({
      name: data?.name ?? "",
      graph_definition: data?.graph_definition ?? "",
    }),
    [data],
  );

  const langgraphForm = useForm<LanggraphValues>({
    resolver: zodResolver(langgraphSchema),
    defaultValues: initialLanggraph,
    values: initialLanggraph,
  });

  const adkForm = useForm<AdkValues>({
    resolver: zodResolver(adkSchema),
    defaultValues: initialAdk,
    values: initialAdk,
  });

  const checkpointerType = langgraphForm.watch("checkpointer_type");

  const save = useMutation({
    mutationFn: (body: AgentRead) =>
      api.putAgent({
        name: body.name,
        framework: body.framework,
        graph_definition: body.graph_definition,
        config: body.config,
      }),
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) {
        setRestartRequired(true);
        toast.warning("Restart required to apply this change.");
      } else {
        setRestartRequired(false);
        toast.success("Saved & reloaded");
      }
      qc.invalidateQueries({ queryKey: ["agent"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const handleSubmit = (values: LanggraphValues | AdkValues) => {
    const body = buildAgentBody(activeTab, values, data?.config);
    save.mutate({ id: data?.id ?? "singleton", ...body });
  };

  const yamlText = useMemo(() => {
    if (!data) return "";
    // Snapshot the form state so the YAML matches what the user sees.
    const values =
      activeTab === "langgraph"
        ? langgraphForm.getValues()
        : adkForm.getValues();
    const body = buildAgentBody(activeTab, values, data.config);
    return stringifyYaml(body);
  }, [data, activeTab, langgraphForm, adkForm, yamlOpen]);

  const persistFromYaml = async (parsed: unknown) => {
    const obj = (parsed ?? {}) as {
      name?: string;
      framework?: string;
      graph_definition?: string;
      config?: Record<string, unknown>;
    };
    const framework: Framework = obj.framework === "adk" ? "adk" : "langgraph";
    const config = obj.config ?? {};
    if (framework === "langgraph") {
      const cp = readCheckpointer(config);
      langgraphForm.reset({
        name: obj.name ?? "",
        graph_definition: obj.graph_definition ?? "",
        checkpointer_type: cp.type,
        checkpointer_url: cp.url,
      });
    } else {
      adkForm.reset({
        name: obj.name ?? "",
        graph_definition: obj.graph_definition ?? "",
      });
    }
    setActiveTab(framework);
    save.mutate({
      id: data?.id ?? "singleton",
      name: obj.name ?? "",
      framework,
      graph_definition: obj.graph_definition ?? "",
      config,
    });
  };

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Agent
        </h1>
        <p className="text-sm text-muted-foreground">
          Identity, graph definition, and checkpointer for the running agent.
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
            Pick the agent framework and edit its configuration. Switching
            frameworks is a structural change and requires a restart.
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

            <TabsContent value="langgraph" className="mt-4">
              <Form {...langgraphForm}>
                <form
                  id="agent-form-langgraph"
                  onSubmit={langgraphForm.handleSubmit(handleSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={langgraphForm.control}
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
                    control={langgraphForm.control}
                    name="graph_definition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Graph definition</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="./agent.py:graph"
                          />
                        </FormControl>
                        <FormDescription>
                          Module path and attribute, separated by a colon.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={langgraphForm.control}
                    name="checkpointer_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Checkpointer</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a checkpointer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="memory">In-memory</SelectItem>
                            <SelectItem value="sqlite">SQLite</SelectItem>
                            <SelectItem value="postgres">PostgreSQL</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {checkpointerType !== "memory" && (
                    <FormField
                      control={langgraphForm.control}
                      name="checkpointer_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Checkpointer URL</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={
                                checkpointerType === "sqlite"
                                  ? "sqlite:///./checkpoint.db"
                                  : "postgresql://user:pass@host:5432/db"
                              }
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

            <TabsContent value="adk" className="mt-4">
              <Form {...adkForm}>
                <form
                  id="agent-form-adk"
                  onSubmit={adkForm.handleSubmit(handleSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={adkForm.control}
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
                    control={adkForm.control}
                    name="graph_definition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Definition</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="./agent.py:agent"
                          />
                        </FormControl>
                        <FormDescription>
                          Module path and attribute for the ADK agent factory.
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
          <Button
            type="submit"
            form={
              activeTab === "langgraph"
                ? "agent-form-langgraph"
                : "agent-form-adk"
            }
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
        title="Edit agent YAML"
        description="Update the full agent payload. Save persists immediately."
      />
    </div>
  );
}
