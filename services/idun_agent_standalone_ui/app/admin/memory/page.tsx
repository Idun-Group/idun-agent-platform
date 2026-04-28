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

type MemoryType = "memory" | "sqlite" | "postgres";
const MEMORY_TYPES: MemoryType[] = ["memory", "sqlite", "postgres"];

const TAB_LABELS: Record<MemoryType, string> = {
  memory: "In-memory",
  sqlite: "SQLite",
  postgres: "PostgreSQL",
};

const sqliteSchema = z.object({
  path: z
    .string()
    .min(1, "Path is required")
    .refine((v) => v.startsWith("sqlite:///"), {
      message: "SQLite URL must start with sqlite:///",
    }),
});

const postgresSchema = z.object({
  connection_url: z
    .string()
    .min(1, "Connection URL is required")
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
      {
        message: "Postgres URL must start with postgresql:// or postgres://",
      },
    ),
});

const memorySchema = z.object({});

type SqliteValues = z.infer<typeof sqliteSchema>;
type PostgresValues = z.infer<typeof postgresSchema>;
type MemoryValues = z.infer<typeof memorySchema>;

function readType(config: Record<string, unknown> | undefined): MemoryType {
  const t = typeof config?.type === "string" ? (config.type as string) : "memory";
  return t === "sqlite" || t === "postgres" ? t : "memory";
}

function readUrl(config: Record<string, unknown> | undefined): string {
  if (typeof config?.db_url === "string") return config.db_url as string;
  if (typeof config?.url === "string") return config.url as string;
  return "";
}

function buildMemoryConfig(
  type: MemoryType,
  values: SqliteValues | PostgresValues | MemoryValues,
): Record<string, unknown> {
  if (type === "memory") return { type: "memory" };
  if (type === "sqlite") {
    return { type: "sqlite", db_url: (values as SqliteValues).path };
  }
  return {
    type: "postgres",
    db_url: (values as PostgresValues).connection_url,
  };
}

export default function MemoryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["memory"],
    queryFn: api.getMemory,
  });

  const initialType = useMemo(() => readType(data?.memory), [data]);
  const initialUrl = useMemo(() => readUrl(data?.memory), [data]);
  const framework: AgentFramework = data?.agentFramework ?? "LANGGRAPH";

  const [activeTab, setActiveTab] = useState<MemoryType>(initialType);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    setActiveTab(initialType);
  }, [initialType]);

  const sqliteForm = useForm<SqliteValues>({
    resolver: zodResolver(sqliteSchema),
    defaultValues: { path: initialType === "sqlite" ? initialUrl : "" },
    values: { path: initialType === "sqlite" ? initialUrl : "" },
  });

  const postgresForm = useForm<PostgresValues>({
    resolver: zodResolver(postgresSchema),
    defaultValues: {
      connection_url: initialType === "postgres" ? initialUrl : "",
    },
    values: {
      connection_url: initialType === "postgres" ? initialUrl : "",
    },
  });

  const memoryForm = useForm<MemoryValues>({
    resolver: zodResolver(memorySchema),
    defaultValues: {},
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
      const message = (detail as { error?: { message?: string } } | undefined)?.error
        ?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const handleSubmit = (
    values: SqliteValues | PostgresValues | MemoryValues,
  ) => {
    save.mutate(buildMemoryConfig(activeTab, values));
  };

  const yamlText = useMemo(() => {
    let values: SqliteValues | PostgresValues | MemoryValues;
    if (activeTab === "sqlite") values = sqliteForm.getValues();
    else if (activeTab === "postgres") values = postgresForm.getValues();
    else values = memoryForm.getValues();
    return stringifyYaml(buildMemoryConfig(activeTab, values));
  }, [activeTab, sqliteForm, postgresForm, memoryForm, yamlOpen]);

  const persistFromYaml = async (parsed: unknown) => {
    const obj = (parsed ?? {}) as Record<string, unknown>;
    const nextType = readType(obj);
    const nextUrl = readUrl(obj);
    setActiveTab(nextType);
    if (nextType === "sqlite") sqliteForm.reset({ path: nextUrl });
    else if (nextType === "postgres")
      postgresForm.reset({ connection_url: nextUrl });
    save.mutate(obj);
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
          <CardTitle>Checkpointer</CardTitle>
          <CardDescription>
            Pick a backend. SQLite suits a single host; PostgreSQL is required
            for multi-replica deployments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(t) => setActiveTab(t as MemoryType)}
          >
            <TabsList>
              {MEMORY_TYPES.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {TAB_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="memory" className="mt-4">
              <Form {...memoryForm}>
                <form
                  id="memory-form-memory"
                  onSubmit={memoryForm.handleSubmit(handleSubmit)}
                  className="space-y-2"
                >
                  <p className="text-sm text-muted-foreground">
                    Volatile checkpointer — state is lost when the process
                    restarts. Useful for development.
                  </p>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="sqlite" className="mt-4">
              <Form {...sqliteForm}>
                <form
                  id="memory-form-sqlite"
                  onSubmit={sqliteForm.handleSubmit(handleSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={sqliteForm.control}
                    name="path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Database path</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
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
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="postgres" className="mt-4">
              <Form {...postgresForm}>
                <form
                  id="memory-form-postgres"
                  onSubmit={postgresForm.handleSubmit(handleSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={postgresForm.control}
                    name="connection_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Connection URL</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
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
            form={`memory-form-${activeTab}`}
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
