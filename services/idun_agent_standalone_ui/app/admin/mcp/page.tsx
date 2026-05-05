"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileCode,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { EditYamlSheet } from "@/components/admin/EditYamlSheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, type ConnectionCheckResult, type McpRead, api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────

const TRANSPORTS = ["stdio", "streamable_http", "sse", "websocket"] as const;
type Transport = (typeof TRANSPORTS)[number];

const TRANSPORT_LABELS: Record<Transport, string> = {
  stdio: "stdio",
  streamable_http: "streamable_http",
  sse: "sse",
  websocket: "websocket",
};

/** A row in the local working list. `id` is null for unsaved additions. */
type ServerRow = {
  id: string | null;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

// ── Form schema ──────────────────────────────────────────────────────────

const kvRowSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const serverFormSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    enabled: z.boolean(),
    transport: z.enum(TRANSPORTS),
    command: z.string().optional().default(""),
    args: z.string().optional().default(""),
    url: z.string().optional().default(""),
    headers: z.array(kvRowSchema).optional().default([]),
    env: z.array(kvRowSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.transport === "stdio") {
      if (!(data.command ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command"],
          message: "Command is required for stdio transport.",
        });
      }
    } else {
      if (!(data.url ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "URL is required for this transport.",
        });
      }
    }
  });

type ServerFormValues = z.infer<typeof serverFormSchema>;

// ── Wire ↔ form converters ───────────────────────────────────────────────

function isTransport(value: unknown): value is Transport {
  return (
    typeof value === "string" &&
    (TRANSPORTS as readonly string[]).includes(value)
  );
}

function recordToRows(
  value: unknown,
): Array<{ key: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
    key: k,
    value: typeof v === "string" ? v : String(v ?? ""),
  }));
}

function rowsToRecord(
  rows: Array<{ key: string; value: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of rows) {
    const k = key.trim();
    if (!k) continue;
    out[k] = value;
  }
  return out;
}

function configToFormValues(
  name: string,
  enabled: boolean,
  config: Record<string, unknown>,
): ServerFormValues {
  const transport: Transport = isTransport(config.transport)
    ? config.transport
    : "stdio";
  const args = Array.isArray(config.args)
    ? (config.args as unknown[]).map((a) => String(a)).join("\n")
    : typeof config.args === "string"
      ? (config.args as string)
      : "";
  return {
    name,
    enabled,
    transport,
    command: typeof config.command === "string" ? (config.command as string) : "",
    args,
    url: typeof config.url === "string" ? (config.url as string) : "",
    headers: recordToRows(config.headers),
    env: recordToRows(config.env),
  };
}

/** Build the wire-shape config for one server, preserving every extra key
 *  from the original payload that the form does not edit. */
function formValuesToConfig(
  values: ServerFormValues,
  baseConfig: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(baseConfig ?? {}) };
  next.transport = values.transport;
  if (values.transport === "stdio") {
    if (values.command.trim()) next.command = values.command.trim();
    else delete next.command;
    const args = values.args
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (args.length > 0) next.args = args;
    else delete next.args;
    const env = rowsToRecord(values.env);
    if (Object.keys(env).length > 0) next.env = env;
    else delete next.env;
    // HTTP-only fields are not relevant for stdio.
    delete next.url;
    delete next.headers;
  } else {
    if (values.url.trim()) next.url = values.url.trim();
    else delete next.url;
    const headers = rowsToRecord(values.headers);
    if (Object.keys(headers).length > 0) next.headers = headers;
    else delete next.headers;
    // Stdio-only fields are not relevant for HTTP transports.
    delete next.command;
    delete next.args;
    delete next.env;
  }
  return next;
}

function emptyFormValues(): ServerFormValues {
  return {
    name: "",
    enabled: true,
    transport: "stdio",
    command: "",
    args: "",
    url: "",
    headers: [],
    env: [],
  };
}

// ── Diff helpers (working list ↔ server state) ───────────────────────────

function rowsEqual(a: ServerRow, b: ServerRow): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.enabled === b.enabled &&
    JSON.stringify(a.config) === JSON.stringify(b.config)
  );
}

function listsEqual(a: ServerRow[], b: ServerRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => rowsEqual(row, b[i]));
}

function serverRowsFromQuery(rows: McpRead[]): ServerRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    config: r.mcpServer ?? {},
  }));
}

// ── Status badge ─────────────────────────────────────────────────────────

function StatusBadge({ row }: { row: ServerRow }) {
  if (row.id === null) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
      >
        new
      </Badge>
    );
  }
  if (!row.enabled) {
    return (
      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
        disabled
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
      enabled
    </Badge>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function McpPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["mcp"],
    queryFn: api.listMcp,
  });

  const initialList = useMemo(() => serverRowsFromQuery(rows), [rows]);

  const [working, setWorking] = useState<ServerRow[]>(initialList);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discoverFor, setDiscoverFor] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const discoverTools = useMutation({
    mutationFn: (id: string) => api.discoverMcpTools(id),
  });

  // Re-sync the working list whenever the query result changes (initial load
  // or post-save invalidate). Only resets when there are no pending edits to
  // avoid clobbering local state.
  useEffect(() => {
    setWorking((prev) =>
      listsEqual(prev, initialList) ? prev : initialList,
    );
  }, [initialList]);

  const isDirty = useMemo(
    () => !listsEqual(working, initialList),
    [working, initialList],
  );

  const form = useForm<ServerFormValues>({
    resolver: zodResolver(serverFormSchema),
    defaultValues: emptyFormValues(),
  });

  const watchedTransport = form.watch("transport");
  const watchedHeaders = form.watch("headers");
  const watchedEnv = form.watch("env");

  function openSheetFor(index: number | null) {
    setEditingIdx(index);
    if (index === null) {
      form.reset(emptyFormValues());
    } else {
      const row = working[index];
      form.reset(configToFormValues(row.name, row.enabled, row.config));
    }
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingIdx(null);
  }

  function onSheetSave(values: ServerFormValues) {
    const trimmedName = values.name.trim();
    if (!trimmedName) {
      form.setError("name", { message: "Name is required" });
      return;
    }
    // Enforce uniqueness across the local list, ignoring the row being edited.
    const collision = working.some(
      (row, idx) => row.name === trimmedName && idx !== editingIdx,
    );
    if (collision) {
      form.setError("name", {
        message: "Another server already uses this name.",
      });
      return;
    }
    const baseConfig =
      editingIdx !== null ? working[editingIdx].config : undefined;
    const nextConfig = formValuesToConfig(values, baseConfig);
    setWorking((prev) => {
      const next = [...prev];
      const newRow: ServerRow = {
        id: editingIdx !== null ? prev[editingIdx].id : null,
        name: trimmedName,
        enabled: values.enabled,
        config: nextConfig,
      };
      if (editingIdx !== null) next[editingIdx] = newRow;
      else next.push(newRow);
      return next;
    });
    closeSheet();
  }

  function confirmDelete() {
    if (confirmIdx === null) return;
    setWorking((prev) => prev.filter((_, i) => i !== confirmIdx));
    setConfirmIdx(null);
  }

  /** Apply the local working list back to the server using per-row CRUD.
   *  Each mutation returns its own reload result; if any reports
   *  ``restart_required`` we surface that. */
  async function onSaveAll() {
    setSaving(true);
    setRestartRequired(false);
    try {
      const initialById = new Map(
        initialList.filter((r) => r.id !== null).map((r) => [r.id as string, r]),
      );
      const workingById = new Map(
        working.filter((r) => r.id !== null).map((r) => [r.id as string, r]),
      );
      const tasks: Array<
        Promise<{ reload: { status: string; message: string; error: string | null } }>
      > = [];

      for (const [id] of initialById) {
        if (!workingById.has(id)) tasks.push(api.deleteMcp(id));
      }
      for (const row of working) {
        if (row.id === null) {
          tasks.push(
            api.createMcp({
              name: row.name,
              mcpServer: { ...row.config, name: row.name },
              enabled: row.enabled,
            }),
          );
        }
      }
      for (const row of working) {
        if (row.id === null) continue;
        const original = initialById.get(row.id);
        if (!original || rowsEqual(row, original)) continue;
        tasks.push(
          api.patchMcp(row.id, {
            name: row.name,
            mcpServer: { ...row.config, name: row.name },
            enabled: row.enabled,
          }),
        );
      }

      const results = await Promise.all(tasks);
      const restart = results.some((r) => r.reload.status === "restart_required");
      const failed = results.find((r) => r.reload.status === "reload_failed");

      if (failed) {
        toast.error(failed.reload.error ?? failed.reload.message);
      } else if (restart) {
        setRestartRequired(true);
        toast.warning("Saved. Restart required to apply.");
      } else if (tasks.length > 0) {
        toast.success("Saved and reloaded.");
      } else {
        toast.message("Nothing to save");
      }
      qc.invalidateQueries({ queryKey: ["mcp"] });
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message =
        (detail as { error?: { message?: string } } | undefined)?.error?.message ??
        (e instanceof Error ? e.message : "Save failed");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // ── YAML round-trip ────────────────────────────────────────────────────
  const yamlText = useMemo(() => {
    return stringifyYaml({
      servers: working.map((row) => ({
        name: row.name,
        enabled: row.enabled,
        config: row.config,
      })),
    });
    // yamlOpen so the snapshot refreshes each time the sheet opens.
  }, [working, yamlOpen]);

  async function persistFromYaml(parsed: unknown) {
    const obj = (parsed ?? {}) as { servers?: unknown };
    const arr = Array.isArray(obj.servers) ? obj.servers : [];
    const seenNames = new Set<string>();
    const next: ServerRow[] = arr.map((entry, i) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      const name = typeof e.name === "string" ? (e.name as string) : `server-${i + 1}`;
      if (seenNames.has(name)) {
        throw new Error(`Duplicate server name in YAML: "${name}"`);
      }
      seenNames.add(name);
      const enabled = e.enabled === undefined ? true : Boolean(e.enabled);
      const config =
        e.config && typeof e.config === "object" && !Array.isArray(e.config)
          ? (e.config as Record<string, unknown>)
          : {};
      // Try to pair each parsed entry with an existing server by name so the
      // diff at save time turns into a patch instead of delete+create.
      const matchById = working.find((row) => row.name === name && row.id !== null);
      return {
        id: matchById?.id ?? null,
        name,
        enabled,
        config,
      };
    });
    setWorking(next);
  }

  // ── Helpers for the env / headers editors ──────────────────────────────

  function addKvRow(slot: "headers" | "env") {
    const current = form.getValues(slot);
    form.setValue(slot, [...current, { key: "", value: "" }], {
      shouldDirty: true,
    });
  }

  function removeKvRow(slot: "headers" | "env", index: number) {
    const current = form.getValues(slot);
    const next = current.filter((_, i) => i !== index);
    form.setValue(slot, next, { shouldDirty: true });
  }

  function updateKvRow(
    slot: "headers" | "env",
    index: number,
    field: "key" | "value",
    value: string,
  ) {
    const current = [...form.getValues(slot)];
    current[index] = { ...current[index], [field]: value };
    form.setValue(slot, current, { shouldDirty: true });
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          MCP servers
        </h1>
        <p className="text-sm text-muted-foreground">
          Tool servers exposed via the Model Context Protocol.
        </p>
      </header>

      {restartRequired && (
        <Alert variant="destructive">
          <RotateCcw />
          <AlertTitle>Restart required</AlertTitle>
          <AlertDescription>
            Structural change detected — restart to apply.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Configured servers</CardTitle>
            <CardDescription>
              {working.length} server{working.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button onClick={() => openSheetFor(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Add server
          </Button>
        </CardHeader>
        <CardContent>
          {working.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No MCP servers configured.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {working.map((row, i) => {
                  const transport = isTransport(row.config.transport)
                    ? row.config.transport
                    : "stdio";
                  const endpoint =
                    transport === "stdio"
                      ? typeof row.config.command === "string"
                        ? (row.config.command as string)
                        : ""
                      : typeof row.config.url === "string"
                        ? (row.config.url as string)
                        : "";
                  return (
                    <TableRow key={row.id ?? `new-${i}`}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {TRANSPORT_LABELS[transport]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[300px]">
                        {endpoint}
                      </TableCell>
                      <TableCell>
                        <StatusBadge row={row} />
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (row.id !== null) {
                              setDiscoverFor({ id: row.id, name: row.name });
                              discoverTools.reset();
                              discoverTools.mutate(row.id);
                            }
                          }}
                          disabled={row.id === null}
                          aria-label={`Discover tools on ${row.name}`}
                          title={
                            row.id === null
                              ? "Save the server first"
                              : "Discover tools"
                          }
                        >
                          <Wrench className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openSheetFor(i)}
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmIdx(i)}
                          className="text-destructive"
                          aria-label={`Delete ${row.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <Button
            variant="outline"
            type="button"
            onClick={() => setYamlOpen(true)}
          >
            <FileCode className="mr-2 h-4 w-4" />
            Edit YAML
          </Button>
          <Button onClick={onSaveAll} disabled={!isDirty || saving}>
            {saving ? "Saving…" : "Save all"}
          </Button>
        </CardFooter>
      </Card>

      {/* Server form sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>
              {editingIdx === null ? "Add MCP server" : "Edit MCP server"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Form {...form}>
              <form
                id="mcp-server-form"
                onSubmit={form.handleSubmit(onSheetSave)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="my-server" />
                      </FormControl>
                      <FormDescription>
                        Unique identifier — used as the connection key.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Enabled</FormLabel>
                        <FormDescription>
                          Disabled servers stay configured but are skipped at
                          startup.
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
                  name="transport"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transport</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v as Transport)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pick a transport" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TRANSPORTS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {TRANSPORT_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedTransport === "stdio" ? (
                  <>
                    <FormField
                      control={form.control}
                      name="command"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Command</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="npx" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="args"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Arguments</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={4}
                              placeholder={
                                "-y\n@modelcontextprotocol/server-filesystem\n./data"
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            One argument per line.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <KvFieldset
                      label="Environment variables"
                      description="Set on the spawned process."
                      rows={watchedEnv}
                      onAdd={() => addKvRow("env")}
                      onRemove={(i) => removeKvRow("env", i)}
                      onChange={(i, k, v) => updateKvRow("env", i, k, v)}
                      keyPlaceholder="VAR_NAME"
                      valuePlaceholder="value"
                    />
                  </>
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com/mcp"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <KvFieldset
                      label="Headers"
                      description="Sent on every HTTP request to the server."
                      rows={watchedHeaders}
                      onAdd={() => addKvRow("headers")}
                      onRemove={(i) => removeKvRow("headers", i)}
                      onChange={(i, k, v) => updateKvRow("headers", i, k, v)}
                      keyPlaceholder="Authorization"
                      valuePlaceholder="Bearer …"
                    />
                  </>
                )}
              </form>
            </Form>
          </div>
          <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button onClick={form.handleSubmit(onSheetSave)}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog
        open={confirmIdx !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmIdx(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP server?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmIdx !== null && (
                <>
                  This removes <strong>{working[confirmIdx]?.name}</strong> from
                  the configuration. The change applies on Save.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* YAML editor */}
      <EditYamlSheet
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlText}
        onSave={persistFromYaml}
        title="Edit MCP servers configuration"
        description="Update the full list of servers. Save here only updates the local list — apply with Save all."
      />

      {/* Tool discovery */}
      <Dialog
        open={discoverFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDiscoverFor(null);
            discoverTools.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {discoverFor ? `Tools — ${discoverFor.name}` : "Tools"}
            </DialogTitle>
            <DialogDescription>
              Probes the server and lists its tools. Doubles as a connection
              check.
            </DialogDescription>
          </DialogHeader>

          <DiscoverResult
            isPending={discoverTools.isPending}
            isError={discoverTools.isError}
            error={discoverTools.error}
            data={discoverTools.data}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => discoverFor && discoverTools.mutate(discoverFor.id)}
              disabled={discoverTools.isPending || discoverFor === null}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button
              onClick={() => {
                setDiscoverFor(null);
                discoverTools.reset();
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractTools(details: Record<string, unknown> | null): string[] {
  if (!details) return [];
  const raw = (details as { tools?: unknown }).tools;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (typeof t === "string") return t;
      if (t && typeof t === "object" && "name" in t) {
        const name = (t as { name?: unknown }).name;
        return typeof name === "string" ? name : null;
      }
      return null;
    })
    .filter((t): t is string => t !== null);
}

function DiscoverResult({
  isPending,
  isError,
  error,
  data,
}: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: ConnectionCheckResult | undefined;
}) {
  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Probing server…
      </div>
    );
  }
  if (isError) {
    const message =
      error instanceof ApiError
        ? ((error.detail as { error?: { message?: string } } | undefined)?.error
            ?.message ?? `Request failed (${error.status}).`)
        : error instanceof Error
          ? error.message
          : "Request failed.";
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Could not reach the server</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;
  if (!data.ok) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Connection failed</AlertTitle>
        <AlertDescription>
          {data.error ?? "The server did not respond to a tool listing."}
        </AlertDescription>
      </Alert>
    );
  }
  const tools = extractTools(data.details);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        Connected — {tools.length} tool{tools.length === 1 ? "" : "s"} discovered.
      </div>
      {tools.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The server reports no tools.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-sm">
          {tools.map((name) => (
            <li
              key={name}
              className="rounded px-2 py-1 font-mono text-xs text-foreground"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Key/value editor ────────────────────────────────────────────────────

function KvFieldset({
  label,
  description,
  rows,
  onAdd,
  onRemove,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  label: string;
  description?: string;
  rows: Array<{ key: string; value: string }>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: "key" | "value", value: string) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium leading-none">{label}</p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => onChange(i, "key", e.target.value)}
                placeholder={keyPlaceholder}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">=</span>
              <Input
                value={row.value}
                onChange={(e) => onChange(i, "value", e.target.value)}
                placeholder={valuePlaceholder}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${label} entry ${i + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
