"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
} from "@/components/ui/combobox";
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
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { ApiError, type GuardrailRead, api } from "@/lib/api";

const GUARD_IDS = [
  "ban_list",
  "detect_pii",
  "nsfw_text",
  "toxic_language",
  "gibberish_text",
  "bias_check",
  "competition_check",
  "correct_language",
  "restrict_to_topic",
] as const;

type GuardId = (typeof GUARD_IDS)[number];

const GUARD_LABELS: Record<GuardId, string> = {
  ban_list: "Ban List",
  detect_pii: "Detect PII",
  nsfw_text: "NSFW Text",
  toxic_language: "Toxic Language",
  gibberish_text: "Gibberish Text",
  bias_check: "Bias Check",
  competition_check: "Competition Check",
  correct_language: "Correct Language",
  restrict_to_topic: "Restrict to Topic",
};

const PII_ENTITIES = [
  "Email",
  "Phone Number",
  "Credit Card",
  "SSN",
  "Location",
] as const;

const GUARD_DEFAULTS: Record<GuardId, GuardFormFields> = {
  ban_list: { reject_message: "ban!!", banned_words: [] },
  detect_pii: { reject_message: "PII detected", pii_entities: [] },
  nsfw_text: { reject_message: "NSFW content", threshold: 0.7 },
  toxic_language: { reject_message: "Toxic content", threshold: 0.7 },
  gibberish_text: { reject_message: "Gibberish detected", threshold: 0.7 },
  bias_check: { reject_message: "Bias detected", threshold: 0.5 },
  competition_check: {
    reject_message: "Competitor mentioned",
    competitors: [],
  },
  correct_language: {
    reject_message: "Language not allowed",
    expected_languages: [],
  },
  restrict_to_topic: {
    reject_message: "Off-topic",
    valid_topics: [],
    invalid_topics: [],
  },
};

type GuardFormFields = {
  reject_message?: string;
  banned_words?: string[];
  pii_entities?: string[];
  competitors?: string[];
  expected_languages?: string[];
  valid_topics?: string[];
  invalid_topics?: string[];
  threshold?: number;
};

const guardFormSchema = z.object({
  config_id: z.enum(GUARD_IDS),
  api_key: z.string().optional().default(""),
  reject_message: z.string().optional(),
  banned_words: z.array(z.string().min(1)).optional().default([]),
  pii_entities: z.array(z.string().min(1)).optional().default([]),
  competitors: z.array(z.string().min(1)).optional().default([]),
  expected_languages: z.array(z.string().min(1)).optional().default([]),
  valid_topics: z.array(z.string().min(1)).optional().default([]),
  invalid_topics: z.array(z.string().min(1)).optional().default([]),
  threshold: z.number().optional(),
});

type GuardFormValues = z.infer<typeof guardFormSchema>;

const rowFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  enabled: z.boolean(),
  position: z.enum(["input", "output"]),
  sortOrder: z.number().int().min(0),
  guard: guardFormSchema,
});

type RowFormValues = z.infer<typeof rowFormSchema>;

type GuardrailRow = {
  id: string | null;
  name: string;
  enabled: boolean;
  position: "input" | "output";
  sortOrder: number;
  guardrail: Record<string, unknown>;
};

function isGuardId(value: unknown): value is GuardId {
  return (
    typeof value === "string" &&
    (GUARD_IDS as readonly string[]).includes(value)
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
}

function wireGuardToForm(raw: Record<string, unknown>): GuardFormValues {
  const id: GuardId = isGuardId(raw.config_id) ? raw.config_id : "ban_list";
  const base: GuardFormValues = {
    config_id: id,
    api_key: typeof raw.api_key === "string" ? raw.api_key : "",
    reject_message:
      typeof raw.reject_message === "string"
        ? (raw.reject_message as string)
        : "",
    banned_words: [],
    pii_entities: [],
    competitors: [],
    expected_languages: [],
    valid_topics: [],
    invalid_topics: [],
  };
  switch (id) {
    case "ban_list":
      base.banned_words = asStringArray(raw.banned_words);
      break;
    case "detect_pii":
      base.pii_entities = asStringArray(raw.pii_entities);
      break;
    case "nsfw_text":
    case "toxic_language":
    case "gibberish_text":
    case "bias_check":
      base.threshold =
        typeof raw.threshold === "number" ? raw.threshold : 0.5;
      break;
    case "competition_check":
      base.competitors = asStringArray(raw.competitors);
      break;
    case "correct_language":
      base.expected_languages = asStringArray(raw.expected_languages);
      break;
    case "restrict_to_topic":
      base.valid_topics = asStringArray(raw.valid_topics ?? raw.topics);
      base.invalid_topics = asStringArray(raw.invalid_topics);
      break;
  }
  return base;
}

function formGuardToWire(g: GuardFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = { config_id: g.config_id };
  if (g.api_key) out.api_key = g.api_key;
  if (g.reject_message) out.reject_message = g.reject_message;
  switch (g.config_id) {
    case "ban_list":
      out.banned_words = g.banned_words ?? [];
      break;
    case "detect_pii":
      out.pii_entities = g.pii_entities ?? [];
      break;
    case "nsfw_text":
    case "toxic_language":
    case "gibberish_text":
    case "bias_check":
      out.threshold = typeof g.threshold === "number" ? g.threshold : 0.5;
      break;
    case "competition_check":
      out.competitors = g.competitors ?? [];
      break;
    case "correct_language":
      out.expected_languages = g.expected_languages ?? [];
      break;
    case "restrict_to_topic":
      out.valid_topics = g.valid_topics ?? [];
      out.invalid_topics = g.invalid_topics ?? [];
      break;
  }
  return out;
}

function emptyRowForm(): RowFormValues {
  return {
    name: "",
    enabled: true,
    position: "input",
    sortOrder: 0,
    guard: {
      config_id: "ban_list",
      api_key: "",
      reject_message: "ban!!",
      banned_words: [],
      pii_entities: [],
      competitors: [],
      expected_languages: [],
      valid_topics: [],
      invalid_topics: [],
    },
  };
}

function rowsFromQuery(rows: GuardrailRead[]): GuardrailRow[] {
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      position: r.position,
      sortOrder: r.sortOrder,
      guardrail: r.guardrail ?? {},
    }))
    .sort(
      (a, b) =>
        a.position.localeCompare(b.position) || a.sortOrder - b.sortOrder,
    );
}

function rowsEqual(a: GuardrailRow, b: GuardrailRow): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.enabled === b.enabled &&
    a.position === b.position &&
    a.sortOrder === b.sortOrder &&
    JSON.stringify(a.guardrail) === JSON.stringify(b.guardrail)
  );
}

function listsEqual(a: GuardrailRow[], b: GuardrailRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => rowsEqual(row, b[i]));
}

function GuardFields({
  control,
  guardId,
}: {
  control: Control<RowFormValues>;
  guardId: GuardId;
}) {
  const isThreshold =
    guardId === "nsfw_text" ||
    guardId === "toxic_language" ||
    guardId === "gibberish_text" ||
    guardId === "bias_check";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField
        control={control}
        name="guard.api_key"
        render={({ field }) => (
          <FormItem className="md:col-span-2">
            <FormLabel>API key</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ""}
                type="password"
                autoComplete="off"
                placeholder="hub-issued key"
              />
            </FormControl>
            <FormDescription>
              Stored on the row and forwarded to the engine on save. If left
              empty, the engine falls back to the GUARDRAILS_API_KEY env var.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="guard.reject_message"
        render={({ field }) => (
          <FormItem className="md:col-span-2">
            <FormLabel>Reject message</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {guardId === "ban_list" && (
        <FormField
          control={control}
          name="guard.banned_words"
          render={({ field }) => {
            const tags = (field.value ?? []) as string[];
            return (
              <FormItem className="md:col-span-2">
                <FormLabel>Banned words</FormLabel>
                <FormControl>
                  <Combobox
                    multiple
                    items={[]}
                    value={tags}
                    onValueChange={(next) => field.onChange(next)}
                  >
                    <ComboboxChips>
                      <ComboboxValue>
                        {tags.map((tag) => (
                          <ComboboxChip key={tag}>{tag}</ComboboxChip>
                        ))}
                      </ComboboxValue>
                      <ComboboxChipsInput placeholder="Add term" />
                    </ComboboxChips>
                  </Combobox>
                </FormControl>
                <FormDescription>
                  Press Enter after each term. Trailing whitespace is trimmed.
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      )}

      {guardId === "detect_pii" && (
        <FormField
          control={control}
          name="guard.pii_entities"
          render={({ field }) => {
            const tags = (field.value ?? []) as string[];
            return (
              <FormItem className="md:col-span-2">
                <FormLabel>PII entities</FormLabel>
                <FormControl>
                  <Combobox
                    multiple
                    items={PII_ENTITIES as unknown as string[]}
                    value={tags}
                    onValueChange={(next) => field.onChange(next)}
                  >
                    <ComboboxChips>
                      <ComboboxValue>
                        {tags.map((tag) => (
                          <ComboboxChip key={tag}>{tag}</ComboboxChip>
                        ))}
                      </ComboboxValue>
                      <ComboboxChipsInput placeholder="Add entity" />
                    </ComboboxChips>
                  </Combobox>
                </FormControl>
                <FormDescription>
                  Each is mapped to its Guardrails Hub identifier server-side
                  (Email → EMAIL_ADDRESS, etc.).
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      )}

      {guardId === "competition_check" && (
        <FormField
          control={control}
          name="guard.competitors"
          render={({ field }) => {
            const tags = (field.value ?? []) as string[];
            return (
              <FormItem className="md:col-span-2">
                <FormLabel>Competitors</FormLabel>
                <FormControl>
                  <Combobox
                    multiple
                    items={[]}
                    value={tags}
                    onValueChange={(next) => field.onChange(next)}
                  >
                    <ComboboxChips>
                      <ComboboxValue>
                        {tags.map((tag) => (
                          <ComboboxChip key={tag}>{tag}</ComboboxChip>
                        ))}
                      </ComboboxValue>
                      <ComboboxChipsInput placeholder="Add competitor" />
                    </ComboboxChips>
                  </Combobox>
                </FormControl>
                <FormDescription>Press Enter after each company name.</FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      )}

      {guardId === "correct_language" && (
        <FormField
          control={control}
          name="guard.expected_languages"
          render={({ field }) => {
            const tags = (field.value ?? []) as string[];
            return (
              <FormItem className="md:col-span-2">
                <FormLabel>Expected languages</FormLabel>
                <FormControl>
                  <Combobox
                    multiple
                    items={[]}
                    value={tags}
                    onValueChange={(next) => field.onChange(next)}
                  >
                    <ComboboxChips>
                      <ComboboxValue>
                        {tags.map((tag) => (
                          <ComboboxChip key={tag}>{tag}</ComboboxChip>
                        ))}
                      </ComboboxValue>
                      <ComboboxChipsInput placeholder="Add language" />
                    </ComboboxChips>
                  </Combobox>
                </FormControl>
                <FormDescription>
                  ISO 639-1 codes (en, fr, es…).
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      )}

      {guardId === "restrict_to_topic" && (
        <>
          <FormField
            control={control}
            name="guard.valid_topics"
            render={({ field }) => {
              const tags = (field.value ?? []) as string[];
              return (
                <FormItem className="md:col-span-2">
                  <FormLabel>Valid topics</FormLabel>
                  <FormControl>
                    <Combobox
                      multiple
                      items={[]}
                      value={tags}
                      onValueChange={(next) => field.onChange(next)}
                    >
                      <ComboboxChips>
                        <ComboboxValue>
                          {tags.map((tag) => (
                            <ComboboxChip key={tag}>{tag}</ComboboxChip>
                          ))}
                        </ComboboxValue>
                        <ComboboxChipsInput placeholder="Add topic" />
                      </ComboboxChips>
                    </Combobox>
                  </FormControl>
                  <FormDescription>
                    Topics the agent IS allowed to discuss.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
          <FormField
            control={control}
            name="guard.invalid_topics"
            render={({ field }) => {
              const tags = (field.value ?? []) as string[];
              return (
                <FormItem className="md:col-span-2">
                  <FormLabel>Invalid topics</FormLabel>
                  <FormControl>
                    <Combobox
                      multiple
                      items={[]}
                      value={tags}
                      onValueChange={(next) => field.onChange(next)}
                    >
                      <ComboboxChips>
                        <ComboboxValue>
                          {tags.map((tag) => (
                            <ComboboxChip key={tag}>{tag}</ComboboxChip>
                          ))}
                        </ComboboxValue>
                        <ComboboxChipsInput placeholder="Add topic" />
                      </ComboboxChips>
                    </Combobox>
                  </FormControl>
                  <FormDescription>
                    Topics the agent must refuse. At least one of the two lists
                    is required.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </>
      )}

      {isThreshold && (
        <FormField
          control={control}
          name="guard.threshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Threshold (0–1)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={
                    typeof field.value === "number" ? String(field.value) : ""
                  }
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    field.onChange(Number.isFinite(next) ? next : 0);
                  }}
                />
              </FormControl>
              <FormDescription>
                Reject when the score exceeds this value.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

export default function GuardrailsPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["guardrails"],
    queryFn: api.listGuardrails,
  });

  const initialList = useMemo(() => rowsFromQuery(rows), [rows]);

  const [working, setWorking] = useState<GuardrailRow[]>(initialList);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWorking((prev) => (listsEqual(prev, initialList) ? prev : initialList));
  }, [initialList]);

  const isDirty = useMemo(
    () => !listsEqual(working, initialList),
    [working, initialList],
  );

  useBeforeUnload(isDirty);

  const form = useForm<RowFormValues>({
    resolver: zodResolver(rowFormSchema),
    defaultValues: emptyRowForm(),
  });

  const watchedGuardId = form.watch("guard.config_id");

  function openSheetFor(index: number | null) {
    setEditingIdx(index);
    if (index === null) {
      form.reset(emptyRowForm());
    } else {
      const row = working[index];
      form.reset({
        name: row.name,
        enabled: row.enabled,
        position: row.position,
        sortOrder: row.sortOrder,
        guard: wireGuardToForm(row.guardrail),
      });
    }
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingIdx(null);
  }

  function onSheetSave(values: RowFormValues) {
    const trimmedName = values.name.trim();
    if (!trimmedName) {
      form.setError("name", { message: "Name is required" });
      return;
    }
    const collision = working.some(
      (row, idx) => row.name === trimmedName && idx !== editingIdx,
    );
    if (collision) {
      form.setError("name", { message: "Another guard already uses this name." });
      return;
    }
    const newRow: GuardrailRow = {
      id: editingIdx !== null ? working[editingIdx].id : null,
      name: trimmedName,
      enabled: values.enabled,
      position: values.position,
      sortOrder: values.sortOrder,
      guardrail: formGuardToWire(values.guard),
    };
    setWorking((prev) => {
      const next = [...prev];
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
        if (!workingById.has(id)) tasks.push(api.deleteGuardrail(id));
      }
      for (const row of working) {
        if (row.id === null) {
          tasks.push(
            api.createGuardrail({
              name: row.name,
              enabled: row.enabled,
              position: row.position,
              sortOrder: row.sortOrder,
              guardrail: row.guardrail,
            }),
          );
        }
      }
      for (const row of working) {
        if (row.id === null) continue;
        const original = initialById.get(row.id);
        if (!original || rowsEqual(row, original)) continue;
        tasks.push(
          api.patchGuardrail(row.id, {
            name: row.name,
            enabled: row.enabled,
            position: row.position,
            sortOrder: row.sortOrder,
            guardrail: row.guardrail,
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
      qc.invalidateQueries({ queryKey: ["guardrails"] });
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

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <AdminPageHeader
        title="Guardrails"
        description="Content safety, PII detection, and topic restrictions for the running agent. Each guard fires in sort order within its position."
        docsHref="https://docs.idunplatform.com/standalone/guardrails"
        isDirty={isDirty}
      />


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
            <CardTitle>Configured guards</CardTitle>
            <CardDescription>
              {working.length} guard{working.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button onClick={() => openSheetFor(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Add guard
          </Button>
        </CardHeader>
        <CardContent>
          {working.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No guardrails configured.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {working.map((row, i) => {
                  const id = isGuardId(row.guardrail.config_id)
                    ? row.guardrail.config_id
                    : "ban_list";
                  return (
                    <TableRow key={row.id ?? `new-${i}`}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{GUARD_LABELS[id]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.position}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.sortOrder}
                      </TableCell>
                      <TableCell>
                        {row.id === null ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          >
                            new
                          </Badge>
                        ) : !row.enabled ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            disabled
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            enabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="flex gap-1">
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
        <CardFooter className="justify-end">
          <Button onClick={onSaveAll} disabled={!isDirty || saving}>
            {saving ? "Saving…" : "Save all"}
          </Button>
        </CardFooter>
      </Card>

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
              {editingIdx === null ? "Add guard" : "Edit guard"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Form {...form}>
              <form
                id="guardrail-form"
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
                        <Input {...field} placeholder="my-ban-list" />
                      </FormControl>
                      <FormDescription>
                        Display name. The slug is derived from this.
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
                          Disabled guards stay configured but are skipped at
                          assembly.
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) =>
                            field.onChange(v as "input" | "output")
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="input">Input</SelectItem>
                            <SelectItem value="output">Output</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            value={
                              typeof field.value === "number"
                                ? String(field.value)
                                : "0"
                            }
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              field.onChange(Number.isFinite(next) ? next : 0);
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          Lower runs first within its position.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="guard.config_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guard type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(next) => {
                          const id = next as GuardId;
                          field.onChange(id);
                          const d = GUARD_DEFAULTS[id];
                          form.setValue(
                            "guard.reject_message",
                            d.reject_message ?? "",
                          );
                          form.setValue(
                            "guard.banned_words",
                            d.banned_words ?? [],
                          );
                          form.setValue(
                            "guard.pii_entities",
                            d.pii_entities ?? [],
                          );
                          form.setValue("guard.competitors", d.competitors ?? []);
                          form.setValue(
                            "guard.expected_languages",
                            d.expected_languages ?? [],
                          );
                          form.setValue(
                            "guard.valid_topics",
                            d.valid_topics ?? [],
                          );
                          form.setValue(
                            "guard.invalid_topics",
                            d.invalid_topics ?? [],
                          );
                          form.setValue("guard.threshold", d.threshold);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GUARD_IDS.map((id) => (
                            <SelectItem key={id} value={id}>
                              {GUARD_LABELS[id]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <GuardFields
                  control={form.control}
                  guardId={isGuardId(watchedGuardId) ? watchedGuardId : "ban_list"}
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

      <AlertDialog
        open={confirmIdx !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmIdx(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete guard?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmIdx !== null && (
                <>
                  This removes <strong>{working[confirmIdx]?.name}</strong> from
                  the configuration. The change applies on Save all.
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
