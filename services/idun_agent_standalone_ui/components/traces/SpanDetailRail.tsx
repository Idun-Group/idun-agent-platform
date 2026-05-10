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
import { XIcon } from "lucide-react";
import * as React from "react";

import { SpanKindIcon } from "@/components/traces/SpanKindIcon";
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
 * Try to read a JSON-encoded value out of an OpenInference attribute.
 * The instrumentation often stores `input.value` / `output.value` as a
 * string of JSON; if it parses, return the parsed value, otherwise
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
 * Pretty/Raw payload viewer for the Input + Output tabs. Pretty mode
 * draws chat bubbles when messages are detected, otherwise prints the
 * value (string in `<pre>`, object in JsonView). Raw mode always uses
 * JsonView so the user has the escape hatch the design KB demands.
 */
function PayloadViewer({
  attrs,
  primaryKey,
  messagesPrefix,
}: {
  attrs: Record<string, unknown> | null;
  primaryKey: "input.value" | "output.value";
  messagesPrefix: "llm.input_messages" | "llm.output_messages";
}) {
  const [mode, setMode] = React.useState<"pretty" | "raw">("pretty");

  const flattenedMessages = React.useMemo(
    () => readMessageList(attrs, messagesPrefix),
    [attrs, messagesPrefix],
  );
  const value = React.useMemo(
    () => readAttributeValue(attrs, primaryKey),
    [attrs, primaryKey],
  );
  const coerced = React.useMemo(() => coerceMessages(value), [value]);
  const messages = flattenedMessages ?? coerced;

  const empty = value === undefined && (!messages || messages.length === 0);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label="Payload format"
        className="flex items-center gap-1 self-end"
      >
        <Button
          type="button"
          size="sm"
          variant={mode === "pretty" ? "secondary" : "ghost"}
          aria-pressed={mode === "pretty"}
          onClick={() => setMode("pretty")}
          className="h-6 px-2 text-[11px]"
        >
          Pretty
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "raw" ? "secondary" : "ghost"}
          aria-pressed={mode === "raw"}
          onClick={() => setMode("raw")}
          className="h-6 px-2 text-[11px]"
        >
          Raw
        </Button>
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
          />
        )
      ) : (
        <JsonView
          value={(value ?? {}) as object}
          collapsed={false}
          displayDataTypes={false}
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
        {tokensGap && !partial && span.costUsd === null ? (
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
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function SpanDetailRail({
  span,
  onClose,
  className,
}: SpanDetailRailProps) {
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
          <Badge variant="outline" className="font-mono text-[10px]">
            {span.kind}
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
        </TabsList>
        <ScrollArea className="flex-1">
          <div className="p-3">
            <TabsContent value="info">
              <InfoTab span={span} />
            </TabsContent>
            <TabsContent value="input">
              <PayloadViewer
                attrs={span.attributes}
                primaryKey="input.value"
                messagesPrefix="llm.input_messages"
              />
            </TabsContent>
            <TabsContent value="output">
              <PayloadViewer
                attrs={span.attributes}
                primaryKey="output.value"
                messagesPrefix="llm.output_messages"
              />
            </TabsContent>
            <TabsContent value="attributes">
              {span.attributes && Object.keys(span.attributes).length > 0 ? (
                <JsonView
                  value={span.attributes}
                  collapsed={1}
                  displayDataTypes={false}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  No attributes recorded.
                </p>
              )}
            </TabsContent>
            <TabsContent value="events">
              <EventsTab events={span.events} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
