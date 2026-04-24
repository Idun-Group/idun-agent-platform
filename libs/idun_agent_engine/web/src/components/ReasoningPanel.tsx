"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ToolCall } from "@/lib/types";
import { stripChartPaths } from "@/lib/agui";

function parseArgs(args: string): any {
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

function oneLiner(args: string): string {
  const p = parseArgs(args);
  if (typeof p === "object" && p !== null) {
    const first = Object.entries(p)[0];
    if (first) return `${first[0]}: ${JSON.stringify(first[1]).slice(0, 60)}`;
  }
  return "…";
}

export default function ReasoningPanel({
  plan,
  thoughts,
  thinking,
  toolCalls,
  streaming,
}: {
  plan?: string;
  thoughts?: string;
  thinking?: boolean;
  toolCalls: ToolCall[];
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const hasContent = plan || thoughts || toolCalls.length > 0;
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
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-2.5 rounded-lg border border-rule bg-surface/60 px-3 py-2 text-left transition hover:bg-surface"
      >
        {streaming ? (
          <span className="pulse-dot shrink-0" />
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="shrink-0 text-emerald-600"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}

        <span className="shrink-0 text-[14px] font-medium text-ink/85">
          {headerLabel}
        </span>

        {streaming && current && (
          <span
            key={current.id}
            className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink/50 animate-[fadeIn_.35s_ease]"
          >
            {oneLiner(current.args)}
          </span>
        )}

        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`ml-auto shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-l-2 border-rule pl-4">
          {thoughts && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Thoughts
              </div>
              <div className="prose-chat text-[13.5px] italic text-ink/70">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{thoughts}</ReactMarkdown>
              </div>
            </div>
          )}
          {plan && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Plan
              </div>
              <div className="prose-chat text-[13.5px] text-ink/80">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan}</ReactMarkdown>
              </div>
            </div>
          )}
          {toolCalls.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Actions
              </div>
              {toolCalls.map((tc, i) => (
                <ToolCallRow key={tc.id} n={i + 1} call={tc} />
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function ToolCallRow({ n, call }: { n: number; call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const parsedArgs = parseArgs(call.args || "");
  const resultText = call.result ? stripChartPaths(call.result) : "";
  const status = call.error ? "error" : call.done ? "ok" : "running";
  const statusColor =
    status === "error" ? "bg-rose-500" : status === "ok" ? "bg-emerald-500" : "bg-amber-400 animate-pulse";

  return (
    <div className="overflow-hidden rounded-md border border-rule bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-canvas"
      >
        <span className="shrink-0 font-mono text-[10px] text-muted">{n}</span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusColor}`} />
        <code className="shrink-0 font-mono text-[11px] text-ink/80">{call.name}</code>
        <span className="truncate font-mono text-[11px] text-ink/50">
          {oneLiner(call.args)}
        </span>
      </button>
      {open && (
        <div className="border-t border-rule">
          <pre className="chat-code overflow-x-auto bg-canvas px-3 py-2 text-ink/80">
            <code>
              {typeof parsedArgs === "string"
                ? parsedArgs
                : JSON.stringify(parsedArgs, null, 2)}
            </code>
          </pre>
          {(resultText || call.error) && (
            <div className="border-t border-rule px-3 py-2">
              {call.error && (
                <pre className="chat-code mb-2 overflow-x-auto rounded bg-rose-50 px-2 py-1.5 text-rose-800">
                  {call.error}
                </pre>
              )}
              {resultText && (
                <pre className="chat-code max-h-56 overflow-auto rounded bg-canvas px-2 py-1.5 text-ink/80">
                  {resultText}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
