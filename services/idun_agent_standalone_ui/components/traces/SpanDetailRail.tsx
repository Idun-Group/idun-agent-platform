"use client";

/**
 * Right-rail span detail.
 *
 * Five-tab layout (`Info / Input / Output / Attributes / Events`)
 * cribbed from Phoenix and MLflow per `tasks/trace-feature-08-05-2026/
 * 12-oss-trace-uis-comparison.md` § 6.1. Pretty/Raw toggle on Input +
 * Output is locked UX from the same KB (§ 6.7) — Pretty renders chat
 * bubbles when the payload looks like `{role, content}[]`, Raw drops
 * to the JSON tree viewer (`@uiw/react-json-view`, locked dep from T5a).
 *
 * Streaming-cost UX: when `costBreakdown.partial === true`, the Info
 * tab prefixes the cost with `~` and shows a small `(?)` tooltip
 * "Approximate — streaming response dropped detail buckets."
 *
 * The component is purely presentational — selection state is owned
 * by the parent (the trace detail page), which passes the resolved
 * span in. Closing the rail (e.g. on mobile) is signalled via
 * `onClose`; on wide screens the rail is permanent and the close
 * button can be omitted.
 */

import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { inferKind } from "@/components/traces/_kind";
import { SpanKindIcon } from "@/components/traces/SpanKindIcon";
import {
  ToolCallCard,
  isToolShapedSpan,
} from "@/components/traces/ToolCallCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StandaloneSpanRead } from "@/lib/api/traces";
import { cn } from "@/lib/utils";

/**
 * Per-kind colour map for the rail's kind badge — pulled from the
 * Waterfall palette so the operator sees consistent kind colouring
 * across the surfaces. AUDIT.md #34: the v1 ``variant="outline"``
 * badge resolved to "border on dark grey on dark grey" in dark mode
 * and was hard to read.
 */
const KIND_BADGE_CLASS: Record<string, string> = {
  LLM: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:bg-blue-500/25 dark:text-blue-300 dark:border-blue-400/40",
  EMBEDDING:
    "bg-purple-500/15 text-purple-600 border-purple-500/30 dark:bg-purple-500/25 dark:text-purple-300 dark:border-purple-400/40",
  CHAIN:
    "bg-gray-500/15 text-gray-700 border-gray-500/30 dark:bg-gray-500/25 dark:text-gray-300 dark:border-gray-400/40",
  RETRIEVER:
    "bg-green-500/15 text-green-700 border-green-500/30 dark:bg-green-500/25 dark:text-green-300 dark:border-green-400/40",
  RERANKER:
    "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:bg-teal-500/25 dark:text-teal-300 dark:border-teal-400/40",
  TOOL: "bg-yellow-500/15 text-yellow-800 border-yellow-500/30 dark:bg-yellow-500/25 dark:text-yellow-300 dark:border-yellow-400/40",
  AGENT:
    "bg-pink-500/15 text-pink-700 border-pink-500/30 dark:bg-pink-500/25 dark:text-pink-300 dark:border-pink-400/40",
  GUARDRAIL:
    "bg-red-500/15 text-red-700 border-red-500/30 dark:bg-red-500/25 dark:text-red-300 dark:border-red-400/40",
  EVALUATOR:
    "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:bg-orange-500/25 dark:text-orange-300 dark:border-orange-400/40",
};

/**
 * Resolve the JsonView style for the current theme.
 *
 * AUDIT.md #42: `@uiw/react-json-view` defaults to a blue-on-white
 * palette; the rail's body is dark in dark mode but the JSON renders
 * with bright cyan keys, jarring the eye. The package ships a
 * `darkTheme` that we apply conditionally on the resolved theme.
 */
function useJsonViewStyle(): React.CSSProperties | undefined {
  const { resolvedTheme } = useTheme();
  if (resolvedTheme === "dark") {
    return darkTheme as React.CSSProperties;
  }
  return undefined;
}

/**
 * "Copy all" button for a JSON payload — AUDIT.md #42.
 *
 * Per-leaf copy buttons in `JsonView` are tiny and only catch
 * single keys. The operator wants to copy a whole tool result or
 * input payload to share / re-run; this button does that.
 *
 * Failure-tolerant: a clipboard write may reject in iframe-blocked
 * test environments — we fall back to a console.warn so unit tests
 * don't blow up.
 */
function CopyAllButton({
  value,
  className,
}: {
  value: unknown;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  // Track the "Copied" timer so we can cancel it on a fresh click or
  // on unmount. Without this, a rapid re-click leaks a timer and the
  // .then() callback can land setState() on an unmounted component
  // (React 19 logs a warning and the timer keeps the closure alive
  // until it fires).
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  React.useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, []);

  const handleClick = React.useCallback(() => {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          if (copiedTimerRef.current !== null) {
            clearTimeout(copiedTimerRef.current);
          }
          copiedTimerRef.current = setTimeout(() => {
            setCopied(false);
            copiedTimerRef.current = null;
          }, 1500);
        })
        .catch(() => {
          // Swallow — surfaced as no-state-change rather than a toast
          // so we never crash the rail on a clipboard permission
          // hiccup. The user can still rely on the per-leaf buttons
          // baked into `JsonView` itself.
        });
    }
  }, [value]);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={handleClick}
      aria-label="Copy payload to clipboard"
      data-testid="copy-all-button"
      className={cn("h-6 gap-1 px-2 text-[11px]", className)}
    >
      {copied ? (
        <>
          <CheckIcon className="size-3" />
          Copied
        </>
      ) : (
        <>
          <CopyIcon className="size-3" />
          Copy all
        </>
      )}
    </Button>
  );
}

export type SpanDetailRailProps = {
  span: StandaloneSpanRead | null;
  /** Optional close handler — only meaningful on narrow viewports. */
  onClose?: () => void;
  className?: string;
};

type ChatMessage = { role: string; content: string };

function isPartialCost(span: StandaloneSpanRead): boolean {
  return Boolean(
    span.costBreakdown && (span.costBreakdown as { partial?: unknown }).partial,
  );
}

/**
 * Detect spans where the instrumentation emitted an LLM-call attribute
 * (``gen_ai.usage.*`` or ``llm.token_count.*``) but the writer's
 * normalised ``promptTokens`` / ``completionTokens`` columns are
 * ``null``. This is the OpenInference→ADK projection gap (AUDIT.md
 * #4): ADK ships ``gen_ai.usage.input_tokens`` / ``output_tokens``
 * which the finalizer does not yet read, so the trace UI shows
 * universal em-dashes for tokens / cost.
 *
 * Sharp edge: do NOT fire on legitimately-zero spans (a TOOL span
 * that just doesn't make an LLM call). Detect via the *presence* of
 * a recognized LLM-call key, not the magnitude of the values.
 */
function hasUnreportedLlmTokens(span: StandaloneSpanRead): boolean {
  if (span.promptTokens !== null && span.promptTokens !== undefined) {
    return false;
  }
  if (span.completionTokens !== null && span.completionTokens !== undefined) {
    return false;
  }
  const attrs = span.attributes;
  if (!attrs || typeof attrs !== "object") return false;
  for (const key of Object.keys(attrs as Record<string, unknown>)) {
    if (key.startsWith("gen_ai.usage.")) return true;
    if (key.startsWith("llm.token_count.")) return true;
  }
  return false;
}

const _TOKEN_GAP_TOOLTIP_BODY =
  "Tokens / cost are aggregated from OpenInference attributes " +
  "(llm.token_count.*, llm.model_name). This span was instrumented " +
  "via Google ADK's gen_ai.* keys, which the platform finalizer " +
  "does not yet read. ADK→OpenInference projection is on the roadmap.";

function TokensEmptyHint(): React.ReactElement {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="tokens-empty-hint"
            aria-label="Why empty?"
            className="inline-flex size-4 cursor-help items-center justify-center rounded-full border text-[10px] text-muted-foreground"
          >
            ?
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {_TOKEN_GAP_TOOLTIP_BODY}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Format a number with up to 4 fraction digits; "—" for null. */
function formatNumber(value: number | null, suffix = ""): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString()}${suffix}`;
}

function formatCostString(span: StandaloneSpanRead): string {
  if (span.costUsd === null || span.costUsd === undefined) return "—";
  const formatted = `$${span.costUsd.toFixed(4)}`;
  return isPartialCost(span) ? `~${formatted}` : formatted;
}

/**
 * Try to read a JSON-encoded value out of an attribute.
 *
 * The instrumentation often stores ``input.value`` / ``output.value``
 * (and ADK's ``gen_ai.input.messages`` / ``gcp.vertex.agent.*``) as
 * strings of JSON; if it parses, return the parsed value, otherwise
 * return the raw string.
 */
function readAttributeValue(
  attrs: Record<string, unknown> | null,
  key: string,
): unknown {
  if (!attrs) return undefined;
  const raw = attrs[key];
  if (raw === undefined || raw === null) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Walk a list of candidate attribute keys and return the first
 * present value (parsed via ``readAttributeValue``).
 *
 * AUDIT.md #14: the v1 ``PayloadViewer`` only checked
 * ``input.value`` / ``output.value`` (OpenInference). On Google ADK
 * traces the data lives under ``gen_ai.input.messages`` /
 * ``gcp.vertex.agent.llm_request`` / ``gcp.vertex.agent.tool_call_args``
 * and the operator saw "No payload recorded." despite a fully
 * instrumented call. The chain is ordered: OpenInference first
 * (canonical), gen_ai second (semconv), gcp.vertex.agent last
 * (vendor). The first present value wins — we MUST NOT swallow
 * OpenInference if ADK keys also happen to exist.
 */
function readFallbackChain(
  attrs: Record<string, unknown> | null,
  keys: readonly string[],
): unknown {
  if (!attrs) return undefined;
  for (const key of keys) {
    const v = attrs[key];
    if (v === undefined || v === null) continue;
    return readAttributeValue(attrs, key);
  }
  return undefined;
}

const INPUT_FALLBACK_KEYS = [
  "input.value",
  "gen_ai.input.messages",
  "gcp.vertex.agent.llm_request",
  "gcp.vertex.agent.tool_call_args",
] as const;

const OUTPUT_FALLBACK_KEYS = [
  "output.value",
  "gen_ai.output.messages",
  "gen_ai.tool.result",
  "gcp.vertex.agent.llm_response",
  "gcp.vertex.agent.tool_response",
] as const;

/**
 * Reconstruct a list of chat messages from the OpenInference
 * `llm.input_messages.<n>.message.{role,content}` flattened keys, if
 * any are present. Returns null when nothing matches.
 */
function readMessageList(
  attrs: Record<string, unknown> | null,
  prefix: "llm.input_messages" | "llm.output_messages",
): ChatMessage[] | null {
  if (!attrs) return null;
  const indexed = new Map<number, Partial<ChatMessage>>();
  for (const [key, raw] of Object.entries(attrs)) {
    if (!key.startsWith(prefix)) continue;
    const match = key.match(
      new RegExp(`^${prefix.replace(".", "\\.")}\\.(\\d+)\\.message\\.(role|content)$`),
    );
    if (!match) continue;
    const [, indexStr, field] = match;
    const idx = Number.parseInt(indexStr, 10);
    if (!Number.isFinite(idx)) continue;
    const slot = indexed.get(idx) ?? {};
    if (field === "role") slot.role = String(raw ?? "");
    else slot.content = String(raw ?? "");
    indexed.set(idx, slot);
  }
  if (indexed.size === 0) return null;
  return Array.from(indexed.entries())
    .sort(([a], [b]) => a - b)
    .map(([, m]) => ({ role: m.role ?? "", content: m.content ?? "" }));
}

/**
 * Reduce a parsed `value` to a chat-message list when possible. We
 * accept three shapes: `{messages: [...]}`, a top-level `[...]`, or
 * the flattened `llm.<input|output>_messages.*` key set already
 * resolved upstream.
 */
function coerceMessages(value: unknown): ChatMessage[] | null {
  if (Array.isArray(value)) {
    if (value.every((m) => m && typeof m === "object" && "role" in m)) {
      return value.map((m) => {
        const obj = m as { role?: unknown; content?: unknown };
        return {
          role: String(obj.role ?? ""),
          content:
            typeof obj.content === "string"
              ? obj.content
              : JSON.stringify(obj.content ?? ""),
        };
      });
    }
  }
  if (
    value &&
    typeof value === "object" &&
    "messages" in (value as Record<string, unknown>)
  ) {
    return coerceMessages((value as { messages: unknown }).messages);
  }
  return null;
}

function ChatBubbles({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-2" data-testid="chat-bubbles">
      {messages.map((m, i) => (
        <div
          key={i}
          data-testid="chat-bubble"
          className={cn(
            "rounded-md border p-2 text-xs",
            m.role === "system" && "border-muted bg-muted/30",
            m.role === "user" && "border-primary/30 bg-primary/5",
            m.role === "assistant" && "border-secondary bg-secondary/30",
            m.role === "tool" && "border-yellow-500/30 bg-yellow-500/10",
          )}
        >
          <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
            {m.role || "message"}
          </div>
          <div className="whitespace-pre-wrap break-words font-sans text-foreground">
            {m.content}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Pretty/Raw payload viewer for the Input + Output tabs.
 *
 * Pretty mode draws chat bubbles when messages are detected, otherwise
 * prints the value (string in ``<pre>``, object in JsonView). Raw
 * mode always uses JsonView so the user has the escape hatch the
 * design KB demands.
 *
 * AUDIT.md #13: the v1 Pretty/Raw toggle was a 2-button group with
 * `ghost` styling on the inactive item — invisible until hover.
 * Replaced with a `<Tabs>` segmented control whose underline + outline
 * make the inactive variant hover-discoverable on first paint.
 *
 * AUDIT.md #14: ``readFallbackChain`` extends the source-of-data hunt
 * across OpenInference, gen_ai, and gcp.vertex.agent attribute
 * shapes so ADK-instrumented spans no longer show "No payload
 * recorded." in the empty-state.
 *
 * AUDIT.md #42: Copy-all button + dark JsonView theme.
 */
function PayloadViewer({
  attrs,
  fallbackKeys,
  messagesPrefix,
}: {
  attrs: Record<string, unknown> | null;
  fallbackKeys: readonly string[];
  messagesPrefix: "llm.input_messages" | "llm.output_messages";
}) {
  const [mode, setMode] = React.useState<"pretty" | "raw">("pretty");
  const jsonStyle = useJsonViewStyle();

  const flattenedMessages = React.useMemo(
    () => readMessageList(attrs, messagesPrefix),
    [attrs, messagesPrefix],
  );
  const value = React.useMemo(
    () => readFallbackChain(attrs, fallbackKeys),
    [attrs, fallbackKeys],
  );
  const coerced = React.useMemo(() => coerceMessages(value), [value]);
  const messages = flattenedMessages ?? coerced;

  const empty = value === undefined && (!messages || messages.length === 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {!empty ? (
          <CopyAllButton value={messages ?? value ?? {}} />
        ) : (
          <span />
        )}
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as "pretty" | "raw")}
          className="self-end"
        >
          <TabsList
            aria-label="Payload format"
            className="h-7 p-0.5"
            data-testid="payload-format-tabs"
          >
            <TabsTrigger
              value="pretty"
              className="h-6 px-2 text-[11px]"
            >
              Pretty
            </TabsTrigger>
            <TabsTrigger
              value="raw"
              className="h-6 px-2 text-[11px]"
            >
              Raw
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {empty ? (
        <p className="text-xs text-muted-foreground">No payload recorded.</p>
      ) : mode === "pretty" ? (
        messages && messages.length > 0 ? (
          <ChatBubbles messages={messages} />
        ) : typeof value === "string" ? (
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2 text-xs">
            {value}
          </pre>
        ) : (
          <JsonView
            value={(value ?? {}) as object}
            collapsed={2}
            displayDataTypes={false}
            style={jsonStyle}
          />
        )
      ) : (
        <JsonView
          value={(value ?? {}) as object}
          collapsed={false}
          displayDataTypes={false}
          style={jsonStyle}
        />
      )}
    </div>
  );
}

function InfoTab({ span }: { span: StandaloneSpanRead }) {
  const partial = isPartialCost(span);
  const tokensGap = hasUnreportedLlmTokens(span);
  const rows: Array<[string, React.ReactNode]> = [
    ["Name", span.name],
    [
      "Kind",
      <span key="kind" className="inline-flex items-center gap-1.5">
        <SpanKindIcon span={span} size={14} />
        <span className="font-mono text-[11px]">{span.kind}</span>
      </span>,
    ],
    ["Started", span.startedAt],
    ["Ended", span.endedAt ?? "—"],
    ["Latency", formatNumber(span.latencyMs, "ms")],
    ["Status", span.status ?? "—"],
    ["Model", span.model ?? "—"],
    ["Provider", span.provider ?? "—"],
    [
      "Prompt tokens",
      <span key="prompt-tokens" className="inline-flex items-center gap-1.5">
        <span>{formatNumber(span.promptTokens)}</span>
        {tokensGap ? <TokensEmptyHint /> : null}
      </span>,
    ],
    [
      "Completion tokens",
      <span
        key="completion-tokens"
        className="inline-flex items-center gap-1.5"
      >
        <span>{formatNumber(span.completionTokens)}</span>
        {tokensGap ? <TokensEmptyHint /> : null}
      </span>,
    ],
    ["Total tokens", formatNumber(span.totalTokens)],
    [
      "Cost",
      <span key="cost" className="inline-flex items-center gap-1.5">
        <span className="font-mono text-[11px]">{formatCostString(span)}</span>
        {partial ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-testid="streaming-cost-hint"
                  aria-label="Approximate cost"
                  className="inline-flex size-4 cursor-help items-center justify-center rounded-full border text-[10px] text-muted-foreground"
                >
                  ?
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Approximate — streaming response dropped detail buckets.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {tokensGap && !partial && span.costUsd == null ? (
          <TokensEmptyHint />
        ) : null}
      </span>,
    ],
    ["Cost source", span.costSource ?? "—"],
  ];

  return (
    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-all text-foreground">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function EventsTab({
  events,
}: {
  events: Array<Record<string, unknown>> | null;
}) {
  const jsonStyle = useJsonViewStyle();
  if (!events || events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No events recorded for this span.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event, i) => {
        const name = (event.name as string | undefined) ?? "event";
        const timestamp = (event.timestamp as string | undefined) ?? "";
        const payload = { ...event };
        delete payload.name;
        delete payload.timestamp;
        return (
          <li key={i} className="rounded-md border p-2 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-mono font-medium text-foreground">{name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {timestamp}
              </span>
            </div>
            {Object.keys(payload).length > 0 ? (
              <JsonView
                value={payload as object}
                collapsed={1}
                displayDataTypes={false}
                style={jsonStyle}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Resolve the kind label shown in the rail header. Mirrors the
 * Waterfall and tree icon resolution: explicit OpenInference kind
 * wins, then the inferred kind from the span name (ADK fallback),
 * then the raw column value as a last resort.
 */
function resolveKindLabel(span: StandaloneSpanRead): string {
  const inferred = inferKind(span);
  if (inferred) return inferred;
  return (span.kind ?? "UNKNOWN").toUpperCase();
}

export function SpanDetailRail({
  span,
  onClose,
  className,
}: SpanDetailRailProps) {
  const jsonStyle = useJsonViewStyle();

  if (!span) {
    return (
      <aside
        aria-label="Span detail"
        className={cn(
          "flex h-full flex-col items-center justify-center p-6 text-xs text-muted-foreground",
          className,
        )}
      >
        Select a span to view its details.
      </aside>
    );
  }

  // AUDIT.md #15 — show the Tool tab as a conditional 6th tab when
  // the span looks tool-shaped. The existing 5 tabs stay in their
  // original positions so operator muscle memory survives.
  const toolShaped = isToolShapedSpan(span);
  const kindLabel = resolveKindLabel(span);
  const kindClass = KIND_BADGE_CLASS[kindLabel] ?? "";

  return (
    <aside
      aria-label="Span detail"
      className={cn("flex h-full flex-col", className)}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background p-3">
        <div className="flex min-w-0 items-center gap-2">
          <SpanKindIcon span={span} size={16} />
          <span
            className="min-w-0 truncate font-mono text-sm font-medium"
            title={span.name}
          >
            {span.name}
          </span>
          {/*
            AUDIT.md #34 — the v1 ``variant="outline"`` badge fell
            apart in dark mode (border-on-dark-grey-on-dark-grey).
            ``variant="secondary"`` plus a per-kind background tint
            from KIND_BADGE_CLASS keeps the kind label legible on
            both palettes, mirroring the Waterfall colour cue.
          */}
          <Badge
            variant="secondary"
            data-testid="span-kind-badge"
            className={cn("font-mono text-[10px]", kindClass)}
          >
            {kindLabel}
          </Badge>
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Close span detail"
            onClick={onClose}
            className="size-7 p-0"
          >
            <XIcon size={14} />
          </Button>
        ) : null}
      </header>
      <Tabs defaultValue="info" className="flex flex-1 flex-col">
        <TabsList className="mx-3 mt-3 self-start">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="attributes">Attributes</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          {toolShaped ? (
            <TabsTrigger value="tool" data-testid="span-rail-tool-tab">
              Tool
            </TabsTrigger>
          ) : null}
        </TabsList>
        <ScrollArea className="flex-1">
          <div className="p-3">
            <TabsContent value="info">
              <InfoTab span={span} />
            </TabsContent>
            <TabsContent value="input">
              <PayloadViewer
                attrs={span.attributes}
                fallbackKeys={INPUT_FALLBACK_KEYS}
                messagesPrefix="llm.input_messages"
              />
            </TabsContent>
            <TabsContent value="output">
              <PayloadViewer
                attrs={span.attributes}
                fallbackKeys={OUTPUT_FALLBACK_KEYS}
                messagesPrefix="llm.output_messages"
              />
            </TabsContent>
            <TabsContent value="attributes">
              {span.attributes && Object.keys(span.attributes).length > 0 ? (
                <div className="flex flex-col gap-2">
                  <CopyAllButton value={span.attributes} className="self-end" />
                  <JsonView
                    value={span.attributes}
                    collapsed={1}
                    displayDataTypes={false}
                    style={jsonStyle}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No attributes recorded.
                </p>
              )}
            </TabsContent>
            <TabsContent value="events">
              <EventsTab events={span.events} />
            </TabsContent>
            {toolShaped ? (
              <TabsContent value="tool">
                <ToolCallCard span={span} />
              </TabsContent>
            ) : null}
          </div>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
