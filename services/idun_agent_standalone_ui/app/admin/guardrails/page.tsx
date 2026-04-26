"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, type Control } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";

// ── Guard catalog ────────────────────────────────────────────────────────
//
// Mirrors the Idun engine guardrails registry. Adding a new guard here means
// registering its config_id, label, and default field values; the form then
// renders the right shadcn primitives based on which keys are present.

const GUARD_IDS = [
  "ban_list",
  "detect_pii",
  "nsfw_text",
  "toxic_language",
  "detect_jailbreak",
  "prompt_injection",
  "bias_check",
  "competition_check",
  "correct_language",
  "gibberish_text",
  "rag_hallucination",
  "restrict_to_topic",
  "code_scanner",
  "custom_llm",
  "model_armor",
] as const;

type GuardId = (typeof GUARD_IDS)[number];

const GUARD_LABELS: Record<GuardId, string> = {
  ban_list: "Ban List",
  detect_pii: "Detect PII",
  nsfw_text: "NSFW Text",
  toxic_language: "Toxic Language",
  detect_jailbreak: "Detect Jailbreak",
  prompt_injection: "Prompt Injection",
  bias_check: "Bias Check",
  competition_check: "Competition Check",
  correct_language: "Correct Language",
  gibberish_text: "Gibberish Text",
  rag_hallucination: "RAG Hallucination",
  restrict_to_topic: "Restrict to Topic",
  code_scanner: "Code Scanner",
  custom_llm: "Custom LLM",
  model_armor: "Model Armor",
};

// Default field shape for each guard. The form schema is permissive — every
// guard rides on the same record type, and renderers branch on config_id.
const GUARD_DEFAULTS: Record<GuardId, GuardFormFields> = {
  ban_list: { reject_message: "ban!!", banned_words: "" },
  detect_pii: { reject_message: "PII detected" },
  nsfw_text: { reject_message: "NSFW content" },
  toxic_language: { reject_message: "Toxic content" },
  detect_jailbreak: { reject_message: "Jailbreak attempt" },
  prompt_injection: { reject_message: "Prompt injection detected" },
  bias_check: { reject_message: "Bias detected", threshold: 0.5 },
  competition_check: { reject_message: "Competitor mentioned", competitors: "" },
  correct_language: { reject_message: "Language not allowed" },
  gibberish_text: { reject_message: "Gibberish detected" },
  rag_hallucination: { reject_message: "Hallucination detected" },
  restrict_to_topic: { reject_message: "Off-topic", valid_topics: "" },
  code_scanner: { reject_message: "Code detected" },
  custom_llm: {
    reject_message: "",
    name: "",
    model: "Gemini 2.5 flash",
    prompt: "",
  },
  model_armor: {
    reject_message: "",
    name: "",
    project_id: "",
    location: "",
    template_id: "",
  },
};

// ── Schema ───────────────────────────────────────────────────────────────

// Form-side fields: arrays are kept as comma-separated strings while the user
// edits, then split on save. Numbers ride as numbers. Optional text per guard.
type GuardFormFields = {
  reject_message?: string;
  banned_words?: string;
  competitors?: string;
  valid_topics?: string;
  threshold?: number;
  name?: string;
  model?: string;
  prompt?: string;
  project_id?: string;
  location?: string;
  template_id?: string;
};

const guardFormSchema = z.object({
  config_id: z.enum(GUARD_IDS),
  reject_message: z.string().optional(),
  banned_words: z.string().optional(),
  competitors: z.string().optional(),
  valid_topics: z.string().optional(),
  threshold: z.number().optional(),
  name: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  project_id: z.string().optional(),
  location: z.string().optional(),
  template_id: z.string().optional(),
});

type GuardFormValues = z.infer<typeof guardFormSchema>;

const guardrailsFormSchema = z.object({
  enabled: z.boolean(),
  input: z.array(guardFormSchema),
  output: z.array(guardFormSchema),
});

type GuardrailsFormValues = z.infer<typeof guardrailsFormSchema>;

// ── Wire ↔ form converters ──────────────────────────────────────────────

function isGuardId(value: unknown): value is GuardId {
  return (
    typeof value === "string" &&
    (GUARD_IDS as readonly string[]).includes(value)
  );
}

function joinList(value: unknown): string {
  return Array.isArray(value) ? (value as string[]).join(", ") : "";
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function wireGuardToForm(raw: Record<string, unknown>): GuardFormValues {
  const id: GuardId = isGuardId(raw.config_id) ? raw.config_id : "ban_list";
  const base: GuardFormValues = {
    config_id: id,
    reject_message:
      typeof raw.reject_message === "string"
        ? (raw.reject_message as string)
        : "",
  };
  if (id === "ban_list") base.banned_words = joinList(raw.banned_words);
  if (id === "competition_check") base.competitors = joinList(raw.competitors);
  if (id === "restrict_to_topic") base.valid_topics = joinList(raw.valid_topics);
  if (id === "bias_check") {
    base.threshold = typeof raw.threshold === "number" ? raw.threshold : 0.5;
  }
  if (id === "custom_llm") {
    base.name = typeof raw.name === "string" ? raw.name : "";
    base.model =
      typeof raw.model === "string" ? raw.model : "Gemini 2.5 flash";
    base.prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  }
  if (id === "model_armor") {
    base.name = typeof raw.name === "string" ? raw.name : "";
    base.project_id =
      typeof raw.project_id === "string" ? raw.project_id : "";
    base.location = typeof raw.location === "string" ? raw.location : "";
    base.template_id =
      typeof raw.template_id === "string" ? raw.template_id : "";
  }
  return base;
}

function formGuardToWire(g: GuardFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = { config_id: g.config_id };
  if (g.reject_message !== undefined && g.reject_message !== "") {
    out.reject_message = g.reject_message;
  }
  switch (g.config_id) {
    case "ban_list":
      out.banned_words = splitList(g.banned_words);
      break;
    case "competition_check":
      out.competitors = splitList(g.competitors);
      break;
    case "restrict_to_topic":
      out.valid_topics = splitList(g.valid_topics);
      break;
    case "bias_check":
      out.threshold = typeof g.threshold === "number" ? g.threshold : 0.5;
      break;
    case "custom_llm":
      out.name = g.name ?? "";
      out.model = g.model ?? "";
      out.prompt = g.prompt ?? "";
      break;
    case "model_armor":
      out.name = g.name ?? "";
      out.project_id = g.project_id ?? "";
      out.location = g.location ?? "";
      out.template_id = g.template_id ?? "";
      break;
    default:
      break;
  }
  return out;
}

function wireToForm(raw: unknown, enabled: unknown): GuardrailsFormValues {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const inputArr = Array.isArray(obj.input)
    ? (obj.input as Record<string, unknown>[])
    : [];
  const outputArr = Array.isArray(obj.output)
    ? (obj.output as Record<string, unknown>[])
    : [];
  return {
    enabled: enabled === undefined ? true : Boolean(enabled),
    input: inputArr.map(wireGuardToForm),
    output: outputArr.map(wireGuardToForm),
  };
}

function formToWire(values: GuardrailsFormValues): {
  config: Record<string, unknown>;
  enabled: boolean;
} {
  return {
    enabled: values.enabled,
    config: {
      input: values.input.map(formGuardToWire),
      output: values.output.map(formGuardToWire),
    },
  };
}

// ── Components ───────────────────────────────────────────────────────────

type Slot = "input" | "output";

const SLOT_LABELS: Record<Slot, string> = {
  input: "Input guards",
  output: "Output guards",
};

const SLOT_DESCRIPTIONS: Record<Slot, string> = {
  input: "Run on each user message before it reaches the agent.",
  output: "Run on each agent response before it reaches the user.",
};

function GuardFields({
  control,
  slot,
  index,
  guardId,
}: {
  control: Control<GuardrailsFormValues>;
  slot: Slot;
  index: number;
  guardId: GuardId;
}) {
  const path = `${slot}.${index}` as const;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {guardId !== "custom_llm" && guardId !== "model_armor" && (
        <FormField
          control={control}
          name={`${path}.reject_message`}
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
      )}

      {guardId === "ban_list" && (
        <FormField
          control={control}
          name={`${path}.banned_words`}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Banned words</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="comma, separated, terms"
                />
              </FormControl>
              <FormDescription>
                Comma-separated; trailing whitespace is trimmed.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {guardId === "competition_check" && (
        <FormField
          control={control}
          name={`${path}.competitors`}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Competitors</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="acme, globex, initech"
                />
              </FormControl>
              <FormDescription>Comma-separated company names.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {guardId === "restrict_to_topic" && (
        <FormField
          control={control}
          name={`${path}.valid_topics`}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Valid topics</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="billing, support, returns"
                />
              </FormControl>
              <FormDescription>
                Comma-separated topic names the agent is allowed to discuss.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {guardId === "bias_check" && (
        <FormField
          control={control}
          name={`${path}.threshold`}
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
                Reject when the bias score exceeds this value.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {guardId === "custom_llm" && (
        <>
          <FormField
            control={control}
            name={`${path}.name`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${path}.model`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${path}.prompt`}
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Prompt</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    rows={4}
                    placeholder="System prompt that judges whether to reject…"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}

      {guardId === "model_armor" && (
        <>
          <FormField
            control={control}
            name={`${path}.name`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${path}.project_id`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project ID</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${path}.location`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${path}.template_id`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Template ID</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </div>
  );
}

function GuardRow({
  control,
  slot,
  index,
  guardId,
  onTypeChange,
  onRemove,
}: {
  control: Control<GuardrailsFormValues>;
  slot: Slot;
  index: number;
  guardId: GuardId;
  onTypeChange: (next: GuardId) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-3">
        <FormField
          control={control}
          name={`${slot}.${index}.config_id`}
          render={({ field }) => (
            <FormItem className="flex-1 space-y-1">
              <FormLabel className="sr-only">Guard type</FormLabel>
              <Select
                value={field.value}
                onValueChange={(next) => onTypeChange(next as GuardId)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a guard type" />
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
            </FormItem>
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Remove ${SLOT_LABELS[slot].toLowerCase()} entry ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <GuardFields
        control={control}
        slot={slot}
        index={index}
        guardId={guardId}
      />
    </Card>
  );
}

function GuardSlotPanel({
  control,
  form,
  slot,
}: {
  control: Control<GuardrailsFormValues>;
  form: ReturnType<typeof useForm<GuardrailsFormValues>>;
  slot: Slot;
}) {
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: slot,
  });
  // Watch the slot so guard cards re-render when the user changes type.
  const watched = form.watch(slot);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{SLOT_DESCRIPTIONS[slot]}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({
              config_id: "ban_list",
              ...GUARD_DEFAULTS.ban_list,
            })
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add guard
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No {SLOT_LABELS[slot].toLowerCase()} configured.
        </Card>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => {
            const current = watched?.[index];
            const guardId: GuardId = isGuardId(current?.config_id)
              ? current.config_id
              : "ban_list";
            return (
              <GuardRow
                key={field.id}
                control={control}
                slot={slot}
                index={index}
                guardId={guardId}
                onTypeChange={(next) => {
                  update(index, {
                    config_id: next,
                    ...GUARD_DEFAULTS[next],
                  });
                }}
                onRemove={() => remove(index)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function GuardrailsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["guardrails"],
    queryFn: api.getGuardrails,
  });

  const initialValues = useMemo(
    () => wireToForm(data?.config, data?.enabled),
    [data],
  );

  const [activeTab, setActiveTab] = useState<Slot>("input");
  const [yamlOpen, setYamlOpen] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  const form = useForm<GuardrailsFormValues>({
    resolver: zodResolver(guardrailsFormSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  // Re-sync form when the query result changes (initial load or invalidate).
  useEffect(() => {
    form.reset(initialValues);
  }, [initialValues, form]);

  const save = useMutation({
    mutationFn: (values: GuardrailsFormValues) =>
      api.putGuardrails(formToWire(values)),
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) {
        setRestartRequired(true);
        toast.warning("Restart required to apply this change.");
      } else {
        setRestartRequired(false);
        toast.success("Saved & reloaded");
      }
      qc.invalidateQueries({ queryKey: ["guardrails"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const handleSubmit = (values: GuardrailsFormValues) => {
    save.mutate(values);
  };

  const yamlText = useMemo(() => {
    const values = form.getValues();
    const wire = formToWire(values);
    return stringifyYaml({
      enabled: wire.enabled,
      ...wire.config,
    });
    // yamlOpen is a dependency so the snapshot refreshes each time the sheet opens.
  }, [form, yamlOpen]);

  const persistFromYaml = async (parsed: unknown) => {
    const obj = (parsed ?? {}) as Record<string, unknown>;
    const enabledRaw = obj.enabled;
    const next = wireToForm(obj, enabledRaw);
    form.reset(next);
    save.mutate(next);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Guardrails
        </h1>
        <p className="text-sm text-muted-foreground">
          Content safety, PII detection, and topic restrictions for the running
          agent.
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

      <Form {...form}>
        <form
          id="guardrails-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>
                Globally enable or disable all guardrails. Individual guards
                still ship to the engine but are bypassed when this is off.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Guardrails enabled</FormLabel>
                      <FormDescription>
                        When off, no guard runs on any input or output.
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guards</CardTitle>
              <CardDescription>
                Add guards on the input or output side. Each guard runs in the
                order it appears here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={(t) => setActiveTab(t as Slot)}
              >
                <TabsList>
                  <TabsTrigger value="input">{SLOT_LABELS.input}</TabsTrigger>
                  <TabsTrigger value="output">
                    {SLOT_LABELS.output}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="input" className="mt-4">
                  <GuardSlotPanel
                    control={form.control}
                    form={form}
                    slot="input"
                  />
                </TabsContent>

                <TabsContent value="output" className="mt-4">
                  <GuardSlotPanel
                    control={form.control}
                    form={form}
                    slot="output"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setYamlOpen(true)}
              >
                Edit YAML
              </Button>
              <Button
                type="submit"
                form="guardrails-form"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>

      <EditYamlSheet
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlText}
        onSave={persistFromYaml}
        title="Edit guardrails YAML"
        description="Update the full guardrails payload."
      />
    </div>
  );
}
