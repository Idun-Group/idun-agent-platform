"use client";

import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ToolCall } from "@/lib/agui";
import { ToolCallRow } from "./ToolCallRow";

type Props = {
  plan?: string;
  thoughts?: string;
  /** True while the run is actively in the "thinking" step — drives the
   * "Thinking…" header label. */
  thinking?: boolean;
  toolCalls: ToolCall[];
  /** Whether the parent message is still streaming. Used to (a) auto-open
   * the panel while in flight and (b) auto-collapse on completion. */
  streaming?: boolean;
};

/** Parse a tool call's `args` JSON. For `execute_python` we surface the
 * `code` field (so the row can syntax-highlight Python); otherwise we
 * return the parsed object (or the raw string if parsing fails). */
export function parseArgs(
  name: string,
  args: string,
): { code?: string; obj?: unknown } {
  try {
    const p = JSON.parse(args) as Record<string, unknown>;
    if (
      name === "execute_python" &&
      typeof (p as { code?: unknown }).code === "string"
    ) {
      return { code: (p as { code: string }).code };
    }
    return { obj: p };
  } catch {
    return { obj: args };
  }
}

/** Best-effort one-line preview for a tool call. Picks the first non-comment
 * line of code, or the first JSON entry, or "…". */
export function oneLiner(name: string, args: string): string {
  const p = parseArgs(name, args);
  if (p.code !== undefined) {
    const firstReal = p.code
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l && !l.startsWith("#") && !l.startsWith('"""') && !l.startsWith("'''"),
      );
    return firstReal
      ? firstReal.length > 80
        ? `${firstReal.slice(0, 80)}…`
        : firstReal
      : "preparing…";
  }
  if (typeof p.obj === "object" && p.obj !== null) {
    const first = Object.entries(p.obj as Record<string, unknown>)[0];
    if (first) return `${first[0]}: ${JSON.stringify(first[1]).slice(0, 60)}`;
  }
  return "…";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Collapsible card that surfaces the assistant's intermediate reasoning:
 * plan, thoughts, and tool calls. Auto-opens while the parent message is
 * streaming so the user can watch it work; collapses once the run finishes
 * (the user can re-open it manually).
 */
export function ReasoningPanel({
  plan,
  thoughts,
  thinking,
  toolCalls,
  streaming,
}: Props) {
  const [open, setOpen] = useState<boolean>(streaming === true);

  // Auto-collapse when streaming flips off. We only force-close on the
  // streaming → not-streaming transition; a follow-up user click can
  // re-open the panel without being clobbered.
  useEffect(() => {
    if (!streaming) setOpen(false);
  }, [streaming]);

  const hasContent = Boolean(plan) || Boolean(thoughts) || toolCalls.length > 0;
  if (!hasContent) return null;

  const current = toolCalls[toolCalls.length - 1];
  const totalSteps = toolCalls.length;
  const headerLabel = thinking
    ? "Thinking…"
    : streaming && current
      ? current.name
      : totalSteps > 0
        ? `Reasoning · ${totalSteps} step${totalSteps === 1 ? "" : "s"}`
        : thoughts
          ? "Thoughts"
          : "Reasoning";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-2 text-left transition hover:bg-card"
      >
        {streaming ? (
          <span className="pulse-dot shrink-0" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        )}

        <span className="shrink-0 text-[14px] font-medium text-foreground/85">
          {headerLabel}
        </span>

        {streaming && current && (
          <span
            key={current.id}
            className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/50"
          >
            {oneLiner(current.name, current.args)}
          </span>
        )}

        <ChevronDown
          className={`ml-auto h-3 w-3 shrink-0 text-muted-foreground transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-l-2 border-border pl-4">
          {thoughts && (
            <Section title="Thoughts">
              <div className="prose-chat text-[13.5px] italic text-muted-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {thoughts}
                </ReactMarkdown>
              </div>
            </Section>
          )}
          {plan && (
            <Section title="Plan">
              <div className="prose-chat text-[13.5px] text-foreground/80">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan}</ReactMarkdown>
              </div>
            </Section>
          )}
          {toolCalls.length > 0 && (
            <Section title="Actions">
              <div className="space-y-2">
                {toolCalls.map((tc, i) => (
                  <ToolCallRow key={tc.id} n={i + 1} call={tc} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
