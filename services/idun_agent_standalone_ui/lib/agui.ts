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
  message: string;
  signal?: AbortSignal;
  onEvent: (event: AGUIEvent) => void;
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
      messages: [{ id: opts.runId + "-u", role: "user", content: opts.message }],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
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
