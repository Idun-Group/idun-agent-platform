"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ToolCall } from "@/lib/agui";
import { oneLiner, parseArgs } from "./ReasoningPanel";

// Override a few keys of `oneDark` so the syntax block sits flush inside
// our row card and matches the editorial mono scale.
const codeStyle = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...(oneDark as Record<string, Record<string, unknown>>)[
      'pre[class*="language-"]'
    ],
    margin: 0,
    padding: "10px 14px",
    background: "#1d1c1a",
    fontSize: "0.76rem",
    lineHeight: 1.5,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
};

type Props = {
  /** 1-based index used as a row prefix. */
  n: number;
  call: ToolCall;
};

/**
 * One row inside the ReasoningPanel's "Actions" list. Header shows status,
 * tool name, and a one-liner preview; clicking expands to the parsed args
 * (Python via syntax highlighter, or JSON / raw string in a pre block) and
 * the result/error if present.
 */
export function ToolCallRow({ n, call }: Props) {
  const [open, setOpen] = useState(false);
  const parsed = parseArgs(call.name, call.args || "");

  const status = call.error ? "error" : call.done ? "ok" : "running";
  const statusColor =
    status === "error"
      ? "bg-rose-500"
      : status === "ok"
        ? "bg-emerald-500"
        : "bg-amber-400 animate-pulse";

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-canvas"
      >
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {n}
        </span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusColor}`} />
        <code className="shrink-0 font-mono text-[11px] text-foreground/80">
          {call.name}
        </code>
        <span className="truncate font-mono text-[11px] text-foreground/50">
          {oneLiner(call.name, call.args)}
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          {parsed.code !== undefined ? (
            parsed.code ? (
              <SyntaxHighlighter
                language="python"
                style={codeStyle as Record<string, Record<string, unknown>>}
                PreTag="div"
              >
                {parsed.code}
              </SyntaxHighlighter>
            ) : (
              <div className="bg-foreground px-4 py-2 font-mono text-[11px] text-muted-foreground">
                …
              </div>
            )
          ) : (
            <pre className="chat-code overflow-x-auto bg-canvas px-3 py-2 text-foreground/80">
              <code>
                {typeof parsed.obj === "string"
                  ? parsed.obj
                  : JSON.stringify(parsed.obj, null, 2)}
              </code>
            </pre>
          )}
          {(call.result || call.error) && (
            <div className="border-t border-border px-3 py-2">
              {call.error && (
                <pre className="chat-code mb-2 overflow-x-auto rounded bg-rose-50 px-2 py-1.5 text-rose-800">
                  {call.error}
                </pre>
              )}
              {call.result && (
                <pre className="chat-code max-h-56 overflow-auto rounded bg-canvas px-2 py-1.5 text-foreground/80">
                  {call.result}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
