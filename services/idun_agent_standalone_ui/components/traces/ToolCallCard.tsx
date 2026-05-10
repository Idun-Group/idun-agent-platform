"use client";

/**
 * Structured Parameters / Result cards for TOOL spans.
 *
 * AUDIT.md finding #15 — the v1 trace UI rendered tool.parameters and
 * tool.result as raw JSON inside the Attributes tab; the operator had
 * to expand 3 levels of `@uiw/react-json-view` to read a single arg.
 * This component parses the payload across the three attribute shapes
 * we observe in the wild and presents key/value rows the operator can
 * read in one glance.
 *
 * Detection (`isToolShapedSpan`) drives the conditional 6th tab in
 * `SpanDetailRail` — only TOOL-like spans gain the Tool tab so the
 * existing 5-tab muscle memory is preserved on every other span.
 *
 * Attribute fallback chain (mirrors `PayloadViewer`):
 *
 * - Tool name: ``tool.name`` → ``gen_ai.tool.name`` → parse from span
 *   name (`execute_tool <name>`).
 * - Description: ``tool.description`` → ``gen_ai.tool.description`` →
 *   undefined.
 * - Parameters: ``tool.parameters`` → ``gen_ai.tool.call.arguments`` →
 *   ``gcp.vertex.agent.tool_call_args`` → undefined.
 * - Result: ``tool.result`` → ``gen_ai.tool.result`` →
 *   ``gcp.vertex.agent.tool_response`` → undefined.
 *
 * Sharp edge: the value at any of those keys may be a string of JSON
 * (the LangChain / OTel writers serialize), an already-parsed object,
 * a string, or null. We try `JSON.parse` first, fall back to the raw
 * value on parse failure. Object-shaped payloads render as rows;
 * non-object payloads render in a `<pre>`.
 */

import * as React from "react";

import type { StandaloneSpanRead } from "@/lib/api/traces";
import { cn } from "@/lib/utils";

const PARAM_KEYS = [
  "tool.parameters",
  "gen_ai.tool.call.arguments",
  "gcp.vertex.agent.tool_call_args",
] as const;

const RESULT_KEYS = [
  "tool.result",
  "gen_ai.tool.result",
  "gcp.vertex.agent.tool_response",
] as const;

const NAME_KEYS = ["tool.name", "gen_ai.tool.name"] as const;
const DESC_KEYS = ["tool.description", "gen_ai.tool.description"] as const;

/**
 * Detect whether the span looks tool-shaped — mirrors AUDIT.md #15.
 *
 * Three signals win:
 * 1. ``kind === "TOOL"`` (LangChain OpenInference path).
 * 2. ``openinference.span.kind === "TOOL"`` attribute (explicit
 *    OpenInference projection at the writer).
 * 3. Span name starts with ``execute_tool`` (Google ADK convention).
 *
 * This is intentionally permissive — the cost of showing the Tool tab
 * on a non-tool span is one empty card; the cost of hiding it on a
 * real tool span is the operator missing the structured view.
 */
export function isToolShapedSpan(span: StandaloneSpanRead): boolean {
  const kind = span.kind?.toUpperCase();
  if (kind === "TOOL") return true;
  if (span.name?.startsWith("execute_tool")) return true;
  const attrs = span.attributes;
  if (attrs && typeof attrs === "object") {
    const explicit = (attrs as Record<string, unknown>)[
      "openinference.span.kind"
    ];
    if (typeof explicit === "string" && explicit.toUpperCase() === "TOOL") {
      return true;
    }
  }
  return false;
}

/** Read the first present attribute from a list of candidate keys. */
function readFirstAttribute(
  attrs: Record<string, unknown> | null,
  keys: readonly string[],
): unknown {
  if (!attrs) return undefined;
  for (const key of keys) {
    const v = attrs[key];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/**
 * The writers serialize JSON-shaped payloads to strings (`json.dumps`)
 * before persisting; the readers deserialize for OpenInference flows
 * but ADK leaves them stringified. Try a `JSON.parse` first; fall back
 * to the raw value on parse failure (legitimate string payload).
 */
function tryParseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Parse `execute_tool <name>` → `<name>`; returns undefined when no match. */
function parseToolNameFromSpanName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const prefix = "execute_tool ";
  if (name.startsWith(prefix)) {
    const tail = name.slice(prefix.length).trim();
    return tail.length > 0 ? tail : undefined;
  }
  return undefined;
}

function readToolName(span: StandaloneSpanRead): string {
  const explicit = readFirstAttribute(span.attributes, NAME_KEYS);
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  return parseToolNameFromSpanName(span.name) ?? span.name ?? "tool";
}

function readToolDescription(span: StandaloneSpanRead): string | undefined {
  const v = readFirstAttribute(span.attributes, DESC_KEYS);
  return typeof v === "string" ? v : undefined;
}

/**
 * Format a leaf value for the inline-row presentation. Strings are
 * quoted to disambiguate from numbers; everything else round-trips
 * through `JSON.stringify` so booleans, null, and numbers all read
 * cleanly.
 */
function formatLeafValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

function PayloadCard({
  label,
  value,
  emptyText,
}: {
  label: string;
  value: unknown;
  emptyText: string;
}) {
  if (value === undefined) {
    return (
      <section
        className="rounded-md border bg-muted/20 p-3"
        data-testid={`tool-${label.toLowerCase()}-empty`}
      >
        <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </h4>
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      </section>
    );
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <section className="rounded-md border bg-muted/20 p-3">
          <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </h4>
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        </section>
      );
    }
    return (
      <section
        className="rounded-md border bg-muted/20 p-3"
        data-testid={`tool-${label.toLowerCase()}-rows`}
      >
        <h4 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </h4>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {entries.map(([k, v]) => {
            const isComplex = v !== null && typeof v === "object";
            return (
              <React.Fragment key={k}>
                <dt className="truncate font-mono text-foreground/80">{k}</dt>
                {isComplex ? (
                  <dd className="min-w-0">
                    <pre className="whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 font-mono text-[11px] text-foreground">
                      {JSON.stringify(v, null, 2)}
                    </pre>
                  </dd>
                ) : (
                  <dd className="min-w-0 break-words font-mono text-foreground">
                    {formatLeafValue(v)}
                  </dd>
                )}
              </React.Fragment>
            );
          })}
        </dl>
      </section>
    );
  }

  // Non-object payload — string, array, number, etc. Render the raw
  // value in a <pre> so we never lose data.
  return (
    <section
      className="rounded-md border bg-muted/20 p-3"
      data-testid={`tool-${label.toLowerCase()}-raw`}
    >
      <h4 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      <pre className="whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] text-foreground">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export function ToolCallCard({
  span,
  className,
}: {
  span: StandaloneSpanRead;
  className?: string;
}) {
  const toolName = readToolName(span);
  const description = readToolDescription(span);
  const params = tryParseJson(readFirstAttribute(span.attributes, PARAM_KEYS));
  const result = tryParseJson(readFirstAttribute(span.attributes, RESULT_KEYS));

  const bothEmpty = params === undefined && result === undefined;

  return (
    <div className={cn("flex flex-col gap-3 text-xs", className)}>
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-sm font-medium text-foreground"
            data-testid="tool-call-card-name"
          >
            {toolName}
          </span>
        </div>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {bothEmpty ? (
        <p
          className="rounded-md border border-dashed bg-muted/10 p-3 text-muted-foreground"
          data-testid="tool-call-card-empty"
        >
          No parameters or result recorded for this tool span.
        </p>
      ) : (
        <>
          <PayloadCard
            label="Parameters"
            value={params}
            emptyText="No parameters recorded."
          />
          <PayloadCard
            label="Result"
            value={result}
            emptyText="No result recorded."
          />
        </>
      )}
    </div>
  );
}
