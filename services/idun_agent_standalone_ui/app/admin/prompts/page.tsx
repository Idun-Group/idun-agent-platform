"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { ApiError, type PromptRead, api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────

/** A row in the local working list. `id` is null for unsaved additions. */
type PromptRow = {
  /** Latest server id for this prompt key, or null if it has never been
   *  persisted (newly added in this session). */
  id: string | null;
  prompt_key: string;
  content: string;
  tags: string[];
  /** Latest version number on the server, used purely for the displayed
   *  "v{n}" badge. Undefined for a brand-new row. */
  version?: number;
};

// ── Form schema ──────────────────────────────────────────────────────────

const promptFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  body: z.string().min(1, "Prompt body is required"),
  tags: z.string(),
});

type PromptFormValues = z.infer<typeof promptFormSchema>;

function emptyFormValues(): PromptFormValues {
  return { name: "", body: "", tags: "" };
}

// ── Variable extraction ─────────────────────────────────────────────────

/** Parse `{{var}}` patterns out of the body and return unique names. */
function extractVariables(body: string): string[] {
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) out.add(match[1]);
  return Array.from(out);
}

// ── Diff helpers (working list ↔ server state) ───────────────────────────

/** Pick the latest version per prompt_key from the server payload. */
function latestPerKey(rows: PromptRead[]): PromptRow[] {
  const m = new Map<string, PromptRead>();
  for (const r of rows) {
    const cur = m.get(r.promptId);
    if (!cur || r.version > cur.version) m.set(r.promptId, r);
  }
  return Array.from(m.values()).map((r) => ({
    id: r.id,
    prompt_key: r.promptId,
    content: r.content,
    tags: r.tags,
    version: r.version,
  }));
}

function rowsEqual(a: PromptRow, b: PromptRow): boolean {
  return (
    a.prompt_key === b.prompt_key &&
    a.content === b.content &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags)
  );
}

function listsEqual(a: PromptRow[], b: PromptRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => rowsEqual(row, b[i]) && row.id === b[i].id);
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function PromptsPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["prompts"],
    queryFn: api.listPrompts,
  });

  const initialList = useMemo(() => latestPerKey(rows), [rows]);

  const versionsByKey = useMemo(() => {
    const m = new Map<string, PromptRead[]>();
    for (const r of rows) {
      const arr = m.get(r.promptId) ?? [];
      arr.push(r);
      m.set(r.promptId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.version - a.version);
    return m;
  }, [rows]);

  const [working, setWorking] = useState<PromptRow[]>(initialList);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Re-sync the working list whenever the query result changes (initial load
  // or post-save invalidate). Only resets when there are no pending edits to
  // avoid clobbering local state.
  useEffect(() => {
    setWorking((prev) => (listsEqual(prev, initialList) ? prev : initialList));
  }, [initialList]);

  const isDirty = useMemo(
    () => !listsEqual(working, initialList),
    [working, initialList],
  );

  useBeforeUnload(isDirty);

  const form = useForm<PromptFormValues>({
    resolver: zodResolver(promptFormSchema),
    defaultValues: emptyFormValues(),
  });

  const watchedBody = useWatch({ control: form.control, name: "body" });
  const detectedVariables = useMemo(
    () => extractVariables(watchedBody ?? ""),
    [watchedBody],
  );

  function openSheetFor(index: number | null) {
    setEditingIdx(index);
    if (index === null) {
      form.reset(emptyFormValues());
    } else {
      const row = working[index];
      form.reset({
        name: row.prompt_key,
        body: row.content,
        tags: row.tags.join(", "),
      });
    }
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingIdx(null);
  }

  function onSheetSave(values: PromptFormValues) {
    const trimmedName = values.name.trim();
    if (!trimmedName) {
      form.setError("name", { message: "Name is required" });
      return;
    }
    const tags = values.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setWorking((prev) => {
      const next = [...prev];
      const targetIdx =
        editingIdx ?? prev.findIndex((r) => r.prompt_key === trimmedName);
      if (targetIdx >= 0 && targetIdx < prev.length) {
        next[targetIdx] = {
          ...prev[targetIdx],
          prompt_key: trimmedName,
          content: values.body,
          tags,
        };
      } else {
        next.push({
          id: null,
          prompt_key: trimmedName,
          content: values.body,
          tags,
        });
      }
      return next;
    });
    closeSheet();
  }

  function confirmDelete() {
    if (confirmIdx === null) return;
    setWorking((prev) => prev.filter((_, i) => i !== confirmIdx));
    setConfirmIdx(null);
  }

  /** Apply the local working list back to the server. The Prompts API only
   *  exposes create + delete (each create produces a new version), so:
   *  - Removed rows → DELETE the latest version's id.
   *  - New rows / mutated rows → POST a new version with the current body.
   *  - Unchanged rows are skipped.
   */
  async function onSaveAll() {
    setSaving(true);
    try {
      const initialById = new Map(
        initialList.filter((r) => r.id !== null).map((r) => [r.id as string, r]),
      );
      const workingById = new Map(
        working.filter((r) => r.id !== null).map((r) => [r.id as string, r]),
      );
      const tasks: Array<Promise<unknown>> = [];

      // Deletes: rows that exist on the server but not in the working list.
      for (const [id] of initialById) {
        if (!workingById.has(id)) tasks.push(api.deletePrompt(id));
      }
      // Creates: brand-new rows with no server id yet.
      for (const row of working) {
        if (row.id === null) {
          tasks.push(
            api.createPrompt({
              promptId: row.prompt_key,
              content: row.content,
              tags: row.tags,
            }),
          );
        }
      }
      // New versions: existing rows whose body or tags changed.
      for (const row of working) {
        if (row.id === null) continue;
        const original = initialById.get(row.id);
        if (!original) continue;
        if (rowsEqual(row, original)) continue;
        tasks.push(
          api.createPrompt({
            promptId: row.prompt_key,
            content: row.content,
            tags: row.tags,
          }),
        );
      }

      if (tasks.length === 0) {
        toast.message("Nothing to save");
        return;
      }
      await Promise.all(tasks);
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["prompts"] });
    } catch (e: unknown) {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message =
        (detail as { message?: string } | undefined)?.message ??
        (e instanceof Error ? e.message : "Save failed");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <AdminPageHeader
        title="Prompts"
        description="Versioned prompt templates. Editing a prompt and saving creates a new version."
        docsHref="https://docs.idunplatform.com/standalone/prompts"
        isDirty={isDirty}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Prompt library</CardTitle>
            <CardDescription>
              {working.length} prompt{working.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button onClick={() => openSheetFor(null)}>
            <Plus className="mr-2 h-4 w-4" />
            New prompt
          </Button>
        </CardHeader>
        <CardContent>
          {working.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No prompts yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {working.map((row, i) => {
                  const vars = extractVariables(row.content);
                  const allVersions = versionsByKey.get(row.prompt_key) ?? [];
                  const olderVersions = allVersions.filter(
                    (v) => v.version !== row.version,
                  );
                  const isExpanded = expanded.has(row.prompt_key);
                  const canExpand = olderVersions.length > 0;
                  return (
                    <Fragment key={row.id ?? `new-${i}`}>
                      <TableRow>
                        <TableCell>
                          {canExpand ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                setExpanded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.prompt_key))
                                    next.delete(row.prompt_key);
                                  else next.add(row.prompt_key);
                                  return next;
                                })
                              }
                              aria-label={
                                isExpanded
                                  ? `Collapse ${row.prompt_key} history`
                                  : `Expand ${row.prompt_key} history`
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-medium font-mono text-xs">
                          {row.prompt_key}
                        </TableCell>
                        <TableCell>
                          {vars.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">
                              None
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {vars.map((v) => (
                                <Badge key={v} variant="outline">
                                  {v}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.id === null ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            >
                              new
                            </Badge>
                          ) : row.version !== undefined ? (
                            <Badge variant="outline">v{row.version}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openSheetFor(i)}
                            aria-label={`Edit ${row.prompt_key}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmIdx(i)}
                            className="text-destructive"
                            aria-label={`Delete ${row.prompt_key}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded &&
                        olderVersions.map((v) => {
                          const oldVars = extractVariables(v.content);
                          return (
                            <Fragment key={v.id}>
                              <TableRow className="bg-muted/30 text-muted-foreground border-b-0">
                                <TableCell />
                                <TableCell className="pl-8 font-mono text-xs italic">
                                  {v.promptId}
                                </TableCell>
                                <TableCell>
                                  {oldVars.length === 0 ? (
                                    <span className="text-xs italic">None</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {oldVars.map((vn) => (
                                        <Badge
                                          key={vn}
                                          variant="outline"
                                          className="opacity-70"
                                        >
                                          {vn}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className="opacity-70"
                                  >
                                    v{v.version}
                                  </Badge>
                                </TableCell>
                                <TableCell />
                              </TableRow>
                              <TableRow className="bg-muted/30 text-muted-foreground">
                                <TableCell />
                                <TableCell colSpan={4} className="pl-8 pb-3">
                                  <pre className="whitespace-pre-wrap rounded border border-border bg-background/60 p-2 font-mono text-xs">
                                    {v.content}
                                  </pre>
                                </TableCell>
                              </TableRow>
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={onSaveAll} disabled={!isDirty || saving}>
            {saving ? "Saving…" : "Save all"}
          </Button>
        </CardFooter>
      </Card>

      {/* Prompt form sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>
              {editingIdx === null ? "New prompt" : "Edit prompt"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Form {...form}>
              <form
                id="prompt-form"
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
                        <Input {...field} placeholder="system-prompt" />
                      </FormControl>
                      <FormDescription>
                        Unique identifier for this prompt template.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="body"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={16}
                          spellCheck={false}
                          className="font-mono text-xs"
                          placeholder="You are a helpful assistant. Today is {{date}}."
                        />
                      </FormControl>
                      <FormDescription>
                        Use <code className="font-mono">{"{{name}}"}</code>{" "}
                        syntax for variables.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium leading-none">
                    Variables detected
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Parsed live from the body.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {detectedVariables.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        None
                      </span>
                    ) : (
                      detectedVariables.map((v) => (
                        <Badge key={v} variant="outline">
                          {v}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="latest, production"
                        />
                      </FormControl>
                      <FormDescription>
                        Comma-separated labels.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
            <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmIdx !== null && (
                <>
                  This removes{" "}
                  <strong>{working[confirmIdx]?.prompt_key}</strong> from the
                  prompt library. The change applies on Save.
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
    </div>
  );
}
