/**
 * Minimal AG-UI client wrapper.
 *
 * Streams Server-Sent Events from the engine's /agent/run endpoint and
 * dispatches each event to onEvent(). We don't ship the full @ag-ui/client
 * package because the protocol surface we need is tiny and avoiding a
 * heavy dep keeps the static export bundle small.
 */

export type AGUIEvent = {
  type: string;
  [key: string]: unknown;
};

export class GuardrailRejectedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "GuardrailRejectedError";
  }
}

export type RunOptions = {
  threadId: string;
  runId: string;
  /** Text turn — append a user message to the history. Mutually
   *  exclusive in practice with forwardedProps but both can be set
   *  if a future flow needs it. */
  message?: string;
  /** Action / metadata turn — carry idun.a2uiClientMessage etc. */
  forwardedProps?: Record<string, unknown>;
  signal?: AbortSignal;
  onEvent: (event: AGUIEvent) => void;
};

// ===== A2UI v0.9 (WS2) =====

/** A2UI v0.9 envelope message. Discriminated by which key is present
 *  (createSurface, updateComponents, updateDataModel). We don't model
 *  the inner shape — the renderer (@a2ui/react/v0_9) handles it. */
export type IdunA2UIMessage = {
  version: "v0.9";
  createSurface?: { surfaceId: string; catalogId: string };
  updateComponents?: { surfaceId: string; components: unknown[] };
  updateDataModel?: { surfaceId: string; value: unknown };
};

/** Payload of a ``CUSTOM idun.a2ui.messages`` event. The engine
 *  emits one of these per ``emit_surface``/``update_components`` call
 *  on the agent side. */
export type IdunA2UIEvent = {
  a2uiVersion: "v0.9";
  surfaceId: string;
  fallbackText?: string;
  messages: IdunA2UIMessage[];
  metadata?: Record<string, unknown>;
};

/** Per-surface state on a Message — accumulated A2UI envelope messages
 *  in arrival order. The MessageProcessor in A2UISurfaceWrapper
 *  consumes these to derive the rendered view. */
export type A2UISurfaceState = {
  surfaceId: string;
  catalogId: string;
  messages: IdunA2UIMessage[];
  fallbackText?: string;
};

import type { A2uiClientAction, A2uiClientDataModel } from "@a2ui/web_core/v0_9";

/** Action wire shape sent from the standalone-UI to the engine via
 *  forwardedProps. Mirrors A2UI v0.9 client_to_server.json#/properties/action
 *  carried inside an idun-namespaced sub-tree so other Idun features can
 *  add fields without colliding. */
export type IdunForwardedProps = {
  idun: {
    a2uiClientMessage: { version: "v0.9"; action: A2uiClientAction };
    a2uiClientDataModel?: A2uiClientDataModel;
  };
};

export type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      toolCalls: ToolCall[];
      thinking: string[];
      /** Editorial chat slots — populated by STEP-aware buffering in useChat.
       * `opener` collects the `acknowledge` step's text deltas, `plan` collects
       * `planner`/`analyst` deltas, `thoughts` is appended to from
       * THINKING_TEXT_MESSAGE_CONTENT events. `currentStep` mirrors the active
       * STEP_STARTED/STEP_FINISHED lifecycle so the ReasoningPanel can show
       * which slot is live. `streaming` is true while the run is in flight. */
      opener?: string;
      plan?: string;
      thoughts?: string;
      currentStep?: string;
      streaming?: boolean;
      a2uiSurfaces?: A2UISurfaceState[];
    };

export type ToolCall = {
  id: string;
  name: string;
  args: string;
  result?: string;
  /** Set when the tool call failed; UI renders the error block (rose). */
  error?: string;
  /** True once TOOL_CALL_END (or equivalent) has fired so the UI can flip
   * the status dot from amber-pulse → emerald. */
  done?: boolean;
};

export async function runAgent(opts: RunOptions): Promise<void> {
  const messages = opts.message
    ? [{ id: opts.runId + "-u", role: "user", content: opts.message }]
    : [];
  const res = await fetch("/agent/run", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      threadId: opts.threadId,
      runId: opts.runId,
      messages,
      state: {},
      tools: [],
      context: [],
      forwardedProps: opts.forwardedProps ?? {},
    }),
    signal: opts.signal,
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => null);
    const detail = (body as { detail?: string } | null)?.detail;
    throw new GuardrailRejectedError(detail ?? "Blocked by a guardrail.");
  }
  if (!res.ok || !res.body) {
    throw new Error(`agent run failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      const dataLine = chunk
        .split("\n")
        .map((l) => (l.startsWith("data:") ? l.slice(5).trim() : null))
        .filter(Boolean)
        .join("");
      if (!dataLine) continue;
      try {
        opts.onEvent(JSON.parse(dataLine));
      } catch {
        // ignore malformed event chunks
      }
    }
  }
}
