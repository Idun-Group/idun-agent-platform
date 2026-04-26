"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { SaveToolbar } from "@/components/admin/SaveToolbar";
import { YamlEditor } from "@/components/admin/YamlEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type GuardrailConfigId =
  | "ban_list"
  | "bias_check"
  | "competition_check"
  | "correct_language"
  | "detect_pii"
  | "gibberish_text"
  | "nsfw_text"
  | "detect_jailbreak"
  | "prompt_injection"
  | "rag_hallucination"
  | "restrict_to_topic"
  | "toxic_language"
  | "code_scanner"
  | "custom_llm"
  | "model_armor";

type Guard = { config_id: GuardrailConfigId } & Record<string, unknown>;

type GuardrailsForm = {
  enabled: boolean;
  input: Guard[];
  output: Guard[];
};

const GUARDS: { id: GuardrailConfigId; label: string }[] = [
  { id: "ban_list", label: "Ban List" },
  { id: "detect_pii", label: "Detect PII" },
  { id: "nsfw_text", label: "NSFW Text" },
  { id: "toxic_language", label: "Toxic Language" },
  { id: "detect_jailbreak", label: "Detect Jailbreak" },
  { id: "prompt_injection", label: "Prompt Injection" },
  { id: "bias_check", label: "Bias Check" },
  { id: "competition_check", label: "Competition Check" },
  { id: "correct_language", label: "Correct Language" },
  { id: "gibberish_text", label: "Gibberish Text" },
  { id: "rag_hallucination", label: "RAG Hallucination" },
  { id: "restrict_to_topic", label: "Restrict to Topic" },
  { id: "code_scanner", label: "Code Scanner" },
  { id: "custom_llm", label: "Custom LLM" },
  { id: "model_armor", label: "Model Armor" },
];

const DEFAULT_GUARD: Record<GuardrailConfigId, Record<string, unknown>> = {
  ban_list: { banned_words: [], reject_message: "ban!!" },
  detect_pii: { reject_message: "PII detected" },
  nsfw_text: { reject_message: "NSFW content" },
  toxic_language: { reject_message: "Toxic content" },
  detect_jailbreak: { reject_message: "Jailbreak attempt" },
  prompt_injection: { reject_message: "Prompt injection detected" },
  bias_check: { threshold: 0.5, reject_message: "Bias detected" },
  competition_check: { competitors: [], reject_message: "Competitor mentioned" },
  correct_language: { reject_message: "Language not allowed" },
  gibberish_text: { reject_message: "Gibberish detected" },
  rag_hallucination: { reject_message: "Hallucination detected" },
  restrict_to_topic: { valid_topics: [], reject_message: "Off-topic" },
  code_scanner: { reject_message: "Code detected" },
  custom_llm: { name: "", model: "Gemini 2.5 flash", prompt: "" },
  model_armor: { name: "", project_id: "", location: "", template_id: "" },
};

function configToForm(raw: Record<string, unknown> | undefined): GuardrailsForm {
  const input = Array.isArray(raw?.input) ? (raw?.input as Guard[]) : [];
  const output = Array.isArray(raw?.output) ? (raw?.output as Guard[]) : [];
  return {
    enabled: raw?.enabled === undefined ? true : Boolean(raw.enabled),
    input,
    output,
  };
}

function formToConfig(f: GuardrailsForm): Record<string, unknown> {
  return { input: f.input, output: f.output };
}

function GuardCard({
  guard,
  onChange,
  onRemove,
}: {
  guard: Guard;
  onChange: (next: Guard) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={guard.config_id}
          onChange={(e) => {
            const next = e.target.value as GuardrailConfigId;
            onChange({ config_id: next, ...DEFAULT_GUARD[next] });
          }}
          className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
        >
          {GUARDS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove">
          ×
        </Button>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-[var(--color-fg)]/60">
          Reject message
        </label>
        <Input
          value={String(guard.reject_message ?? "")}
          onChange={(e) => onChange({ ...guard, reject_message: e.target.value })}
        />
      </div>
      {guard.config_id === "ban_list" && (
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/60">
            Banned words (comma-separated)
          </label>
          <Input
            value={Array.isArray(guard.banned_words)
              ? (guard.banned_words as string[]).join(", ")
              : ""}
            onChange={(e) =>
              onChange({
                ...guard,
                banned_words: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}
      {guard.config_id === "competition_check" && (
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/60">
            Competitors (comma-separated)
          </label>
          <Input
            value={Array.isArray(guard.competitors)
              ? (guard.competitors as string[]).join(", ")
              : ""}
            onChange={(e) =>
              onChange({
                ...guard,
                competitors: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}
      {guard.config_id === "restrict_to_topic" && (
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/60">
            Valid topics (comma-separated)
          </label>
          <Input
            value={Array.isArray(guard.valid_topics)
              ? (guard.valid_topics as string[]).join(", ")
              : ""}
            onChange={(e) =>
              onChange({
                ...guard,
                valid_topics: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}
      {guard.config_id === "bias_check" && (
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-fg)]/60">
            Threshold (0–1)
          </label>
          <Input
            type="number"
            step="0.05"
            value={String(guard.threshold ?? 0.5)}
            onChange={(e) =>
              onChange({ ...guard, threshold: Number(e.target.value) })
            }
          />
        </div>
      )}
    </Card>
  );
}

export default function GuardrailsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["guardrails"],
    queryFn: api.getGuardrails,
  });
  const [form, setForm] = useState<GuardrailsForm>(configToForm(undefined));
  const [editYaml, setEditYaml] = useState(false);

  const initialForm = useMemo(
    () => configToForm(data?.config as Record<string, unknown> | undefined),
    [data],
  );

  useEffect(() => {
    if (data) {
      const next = configToForm(data.config as Record<string, unknown> | undefined);
      next.enabled = data.enabled === undefined ? true : Boolean(data.enabled);
      setForm(next);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (next: GuardrailsForm) =>
      api.putGuardrails({ config: formToConfig(next), enabled: next.enabled }),
    onSuccess: (resp: unknown) => {
      const r = resp as { restart_required?: boolean };
      if (r?.restart_required) toast.warning("Restart required to apply.");
      else toast.success("Saved & reloaded");
      qc.invalidateQueries({ queryKey: ["guardrails"] });
    },
    onError: (e: unknown) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { message?: string } | undefined)?.message;
      toast.error(message ?? "Save failed");
    },
  });

  if (isLoading) return <div className="p-6">Loading…</div>;

  const initialFromData: GuardrailsForm = data
    ? { ...initialForm, enabled: data.enabled === undefined ? true : Boolean(data.enabled) }
    : initialForm;
  const dirty = JSON.stringify(form) !== JSON.stringify(initialFromData);

  const addGuard = (slot: "input" | "output") => {
    const newGuard: Guard = { config_id: "ban_list", ...DEFAULT_GUARD.ban_list };
    setForm({ ...form, [slot]: [...form[slot], newGuard] });
  };

  return (
    <>
      <SaveToolbar
        title="Guardrails"
        dirty={dirty}
        busy={save.isPending}
        onRevert={() => setForm(initialFromData)}
        onSave={() => save.mutate(form)}
        extraActions={
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => setEditYaml((v) => !v)}
          >
            {editYaml ? "Done editing YAML" : "Edit YAML"}
          </Button>
        }
      />
      <div className="p-6 max-w-4xl space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Guardrails enabled
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
                Input guards
              </h3>
              <Button size="sm" variant="ghost" onClick={() => addGuard("input")}>
                + Add
              </Button>
            </div>
            <div className="space-y-2">
              {form.input.length === 0 && (
                <Card className="p-3 text-xs text-[var(--color-fg)]/60">
                  No input guards.
                </Card>
              )}
              {form.input.map((g, i) => (
                <GuardCard
                  key={i}
                  guard={g}
                  onChange={(next) => {
                    const arr = form.input.slice();
                    arr[i] = next;
                    setForm({ ...form, input: arr });
                  }}
                  onRemove={() =>
                    setForm({
                      ...form,
                      input: form.input.filter((_, j) => j !== i),
                    })
                  }
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-fg)]/60">
                Output guards
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addGuard("output")}
              >
                + Add
              </Button>
            </div>
            <div className="space-y-2">
              {form.output.length === 0 && (
                <Card className="p-3 text-xs text-[var(--color-fg)]/60">
                  No output guards.
                </Card>
              )}
              {form.output.map((g, i) => (
                <GuardCard
                  key={i}
                  guard={g}
                  onChange={(next) => {
                    const arr = form.output.slice();
                    arr[i] = next;
                    setForm({ ...form, output: arr });
                  }}
                  onRemove={() =>
                    setForm({
                      ...form,
                      output: form.output.filter((_, j) => j !== i),
                    })
                  }
                />
              ))}
            </div>
          </section>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-fg)]/50 mb-2">
            {editYaml ? "YAML editor" : "YAML preview"}
          </div>
          <YamlEditor
            value={formToConfig(form)}
            readOnly={!editYaml}
            onChange={(v) =>
              setForm({ ...form, ...configToForm(v as Record<string, unknown>) })
            }
          />
        </div>
      </div>
    </>
  );
}
