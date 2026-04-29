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
import { ApiError, type AgentFramework, api } from "@/lib/api";

const LG_TYPES = ["memory", "sqlite", "postgres"] as const;
const ADK_TYPES = ["in_memory", "vertex_ai", "database"] as const;
type MemoryType = (typeof LG_TYPES)[number] | (typeof ADK_TYPES)[number];

const TAB_LABELS: Record<MemoryType, string> = {
  memory: "In-memory",
  sqlite: "SQLite",
  postgres: "PostgreSQL",
  in_memory: "In-memory",
  vertex_ai: "Vertex AI",
  database: "Database",
};

const formSchema = z
  .object({
    type: z.enum([...LG_TYPES, ...ADK_TYPES] as [MemoryType, ...MemoryType[]]),
    db_url: z.string().optional().default(""),
    project_id: z.string().optional().default(""),
    location: z.string().optional().default(""),
    reasoning_engine_app_name: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.type === "sqlite") {
      if (!data.db_url?.startsWith("sqlite:///")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["db_url"],
          message: "SQLite URL must start with sqlite:///",
        });
      }
    }
    if (data.type === "postgres") {
      if (
        !(
          data.db_url?.startsWith("postgresql://") ||
          data.db_url?.startsWith("postgres://")
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["db_url"],
          message: "Postgres URL must start with postgresql:// or postgres://",
        });
      }
    }
    if (data.type === "database") {
      if (!data.db_url?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["db_url"],
          message: "Database URL is required",
        });
      }
    }
    if (data.type === "vertex_ai") {
      if (!data.project_id?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["project_id"],
          message: "Project ID is required",
        });
      }
      if (!data.location?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["location"],
          message: "Location is required",
        });
      }
      if (!data.reasoning_engine_app_name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reasoning_engine_app_name"],
          message: "Reasoning engine app name is required",
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

function defaultType(framework: AgentFramework): MemoryType {
  return framework === "ADK" ? "in_memory" : "memory";
}

function isValidType(framework: AgentFramework, t: unknown): t is MemoryType {
  const set: readonly string[] =
    framework === "ADK" ? ADK_TYPES : LG_TYPES;
  return typeof t === "string" && set.includes(t);
}

function configToValues(
  framework: AgentFramework,
  config: Record<string, unknown> | undefined,
): FormValues {
  const cfg = config ?? {};
  const rawType = cfg.type;
  const type: MemoryType = isValidType(framework, rawType)
    ? (rawType as MemoryType)
    : defaultType(framework);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    type,
    db_url: str(cfg.db_url) || str(cfg.url),
    project_id: str(cfg.project_id),
    location: str(cfg.location),
    reasoning_engine_app_name: str(cfg.reasoning_engine_app_name),
  };
}

function valuesToConfig(values: FormValues): Record<string, unknown> {
  switch (values.type) {
    case "memory":
    case "in_memory":
      return { type: values.type };
    case "sqlite":
    case "postgres":
    case "database":
      return { type: values.type, db_url: values.db_url };
    case "vertex_ai":
      return {
        type: "vertex_ai",
        project_id: values.project_id,
        location: values.location,
        reasoning_engine_app_name: values.reasoning_engine_app_name,
      };
  }
}

export default function MemoryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["memory"],
    queryFn: api.getMemory,
  });

  const framework: AgentFramework = data?.agentFramework ?? "LANGGRAPH";
  const types = framework === "ADK" ? ADK_TYPES : LG_TYPES;

  const initialValues = useMemo(
    () => configToValues(framework, data?.memory),
    [framework, data],
  );

  const [activeTab, setActiveTab] = useState<MemoryType>(initialValues.type);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    setActiveTab(initialValues.type);
  }, [initialValues.type]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      api.patchMemory({ agentFramework: framework, memory: next }),
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
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { error?: { message?: string } } | undefined)
        ?.error?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const onSheetSave = (values: FormValues) => {
    save.mutate(valuesToConfig({ ...values, type: activeTab }));
  };

  const yamlText = useMemo(() => {
    const v = form.getValues();
    return stringifyYaml(valuesToConfig({ ...v, type: activeTab }));
  }, [activeTab, form, yamlOpen]);

  const persistFromYaml = async (parsed: unknown) => {
    const obj = (parsed ?? {}) as Record<string, unknown>;
    const next = configToValues(framework, obj);
    setActiveTab(next.type);
    form.reset(next);
    save.mutate(valuesToConfig(next));
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Memory
        </h1>
        <p className="text-sm text-muted-foreground">
          Where the agent persists conversational state between turns.
          Backends are scoped to the active framework ({framework}).
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
          <CardTitle>Backend</CardTitle>
          <CardDescription>
            {framework === "ADK"
              ? "ADK session service. Vertex AI is required for multi-replica deployments."
              : "LangGraph checkpointer. PostgreSQL is required for multi-replica deployments."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(t) => setActiveTab(t as MemoryType)}
          >
            <TabsList>
              {types.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {TAB_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>

            <Form {...form}>
              <form
                id="memory-form"
                onSubmit={form.handleSubmit(onSheetSave)}
                className="mt-4 space-y-4"
              >
                {(activeTab === "memory" || activeTab === "in_memory") && (
                  <p className="text-sm text-muted-foreground">
                    Volatile backend — state is lost when the process restarts.
                    Useful for development.
                  </p>
                )}

                {activeTab === "sqlite" && (
                  <FormField
                    control={form.control}
                    name="db_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Database path</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="sqlite:///./checkpoint.db"
                          />
                        </FormControl>
                        <FormDescription>
                          File-backed SQLite URL. Must start with{" "}
                          <code className="font-mono">sqlite:///</code>.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {activeTab === "postgres" && (
                  <FormField
                    control={form.control}
                    name="db_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Connection URL</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="postgresql://user:pass@host:5432/db"
                          />
                        </FormControl>
                        <FormDescription>
                          Must start with{" "}
                          <code className="font-mono">postgresql://</code> or{" "}
                          <code className="font-mono">postgres://</code>.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {activeTab === "database" && (
                  <FormField
                    control={form.control}
                    name="db_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Database URL</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="postgresql+psycopg://user:pass@host:5432/db"
                          />
                        </FormControl>
                        <FormDescription>
                          Backend rewrites <code className="font-mono">postgresql://</code>{" "}
                          to <code className="font-mono">postgresql+psycopg://</code>{" "}
                          automatically.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {activeTab === "vertex_ai" && (
                  <>
                    <FormField
                      control={form.control}
                      name="project_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project ID</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="my-gcp-project"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="us-central1"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="reasoning_engine_app_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reasoning engine app name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="reasoning-engine-id-or-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </form>
            </Form>
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
            onClick={form.handleSubmit(onSheetSave)}
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
        title="Edit memory YAML"
        description="Update the full memory config payload."
      />
    </div>
  );
}
