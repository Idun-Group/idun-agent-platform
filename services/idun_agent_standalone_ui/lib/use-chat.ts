"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type AGUIEvent, type Message, runAgent } from "@/lib/agui";
import { ApiError, api } from "@/lib/api";

type Status = "idle" | "streaming" | "error";

/** Event ring kept by the chat hook so layouts like InspectorLayout can render
 * a live event stream alongside the chat. We cap at MAX_EVENTS so a long-
 * running session doesn't grow without bound. */
const MAX_EVENTS = 200;

export type ChatEvent = AGUIEvent & {
  /** Stable id for React key — assigned on capture. */
  _id: number;
  /** Capture timestamp (ms epoch). */
  _at: number;
};

/** Strip <think>...</think> blocks from streamed text. Mirrors the helper used
 * in the reference customer-service-adk web app: closed blocks are removed,
 * an unterminated trailing block is dropped, and any leading blank lines left
 * behind are trimmed so the visible buffer doesn't start with whitespace. */
function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^<think>[\s\S]*$/, "")
    .replace(/^\s*\n+/, "");
}

/** Step names that route TEXT_MESSAGE_CONTENT into the `plan` buffer. */
const PLAN_STEPS = new Set(["planner", "analyst"]);

/** Mutable closure used by applyEvent to remember the latest assistant text
 * seen on a MESSAGES_SNAPSHOT — RUN_FINISHED falls back to it when no
 * TEXT_MESSAGE_CONTENT deltas accumulated text. Lifted out of `send()` so
 * the hydration replay can share the same fallback. */
type SnapshotRef = { current: string | null };

/**
 * Apply a single AG-UI event to the chat state.
 *
 * Shared by the live SSE stream callback and the hydration replay so the
 * persisted trace events rebuild the same view a live run would. The
 * function is intentionally side-effecty (calls setMessages / setStatus /
 * setError) but pure with respect to its inputs — the caller decides which
 * setters to wire in. ``snapshotRef.current`` is mutated when a
 * MESSAGES_SNAPSHOT carries an assistant message so RUN_FINISHED can
 * hydrate the bubble even if the assistant message hasn't been allocated.
 *
 * Events arrive in two shapes — both already snake_case for nested fields
 * (engine and traces sink both serialize via Pydantic ``model_dump``) but
 * we still tolerate camelCase keys (`toolCallId`, `stepName`) so that any
 * upstream change to ``by_alias=True`` doesn't break the chat surface.
 */
function applyEvent(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setStatus: React.Dispatch<React.SetStateAction<Status>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  snapshotRef: SnapshotRef,
  e: AGUIEvent,
): void {
  const t = String(e.type ?? "");

  // updateLatestAssistant mutates the trailing assistant message — i.e. the
  // bubble that's currently streaming or just hydrated. During a live run
  // ``send()`` allocates one explicitly; during hydration the snapshot pre-
  // pass seeds the messages list and then events apply against the latest
  // assistant slot. If no assistant message exists yet (e.g. RUN_STARTED
  // arrives before any snapshot during hydration), allocate a placeholder
  // so subsequent text deltas have somewhere to land.
  const updateLatestAssistant = (fn: (m: Message) => Message) =>
    setMessages((prev) => {
      // Walk from the tail to find the last assistant. Most chats have
      // ``[user, assistant]`` at the end so this terminates immediately.
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant") {
          const next = prev.slice();
          next[i] = fn(prev[i]);
          return next;
        }
      }
      return prev;
    });

  switch (t) {
    // — Text lifecycle ----------------------------------------
    case "TEXT_MESSAGE_START":
    case "TextMessageStart":
      // Pragmatic: today we already accumulate into a single bubble.
      // If the buffer is non-empty we leave it alone; downstream
      // consumers can split on START boundaries when the UX needs it.
      break;
    case "TEXT_MESSAGE_CONTENT":
    case "TextMessageContent": {
      const delta = (e.delta as string) ?? "";
      updateLatestAssistant((m) => {
        if (m.role !== "assistant") return m;
        const step = m.currentStep;
        if (step === "acknowledge") {
          return {
            ...m,
            opener: stripThink((m.opener ?? "") + delta),
          };
        }
        if (step && PLAN_STEPS.has(step)) {
          return {
            ...m,
            plan: stripThink((m.plan ?? "") + delta),
          };
        }
        return { ...m, text: stripThink(m.text + delta) };
      });
      break;
    }
    case "TEXT_MESSAGE_END":
    case "TextMessageEnd":
      // Close the current text segment. With the single-bubble model
      // there's nothing to do — the buffer is already final.
      break;

    // — Tool call lifecycle -----------------------------------
    case "TOOL_CALL_START":
    case "ToolCallStart":
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? {
              ...m,
              toolCalls: [
                ...m.toolCalls,
                {
                  id: String(e.toolCallId ?? e.tool_call_id ?? ""),
                  name: String(
                    e.toolCallName ?? e.tool_call_name ?? "tool",
                  ),
                  args: "",
                },
              ],
            }
          : m,
      );
      break;
    case "TOOL_CALL_ARGS":
    case "ToolCallArgs":
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === String(e.toolCallId ?? e.tool_call_id ?? "")
                  ? { ...tc, args: tc.args + ((e.delta as string) ?? "") }
                  : tc,
              ),
            }
          : m,
      );
      break;
    case "TOOL_CALL_END":
    case "ToolCallEnd":
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === String(e.toolCallId ?? e.tool_call_id ?? "")
                  ? {
                      ...tc,
                      result: JSON.stringify(e.result ?? null),
                      done: true,
                    }
                  : tc,
              ),
            }
          : m,
      );
      break;

    // — Thinking lifecycle ------------------------------------
    case "THINKING_START":
    case "ThinkingStart":
    case "THINKING_TEXT_MESSAGE_START":
    case "ThinkingTextMessageStart":
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? { ...m, thinking: [...m.thinking, ""] }
          : m,
      );
      break;
    case "THINKING_TEXT_MESSAGE_CONTENT":
    case "ThinkingTextMessageContent": {
      const delta = String(e.delta ?? "");
      updateLatestAssistant((m) => {
        if (m.role !== "assistant") return m;
        const idx = m.thinking.length - 1;
        // Maintain the legacy `thinking[]` buffer for any
        // remaining block-renderer consumers and additively
        // populate the new flat `thoughts` slot used by the
        // editorial ReasoningPanel (rendered via MessageView).
        const nextThinking =
          idx < 0
            ? [delta]
            : m.thinking.map((b, i) => (i === idx ? b + delta : b));
        return {
          ...m,
          thinking: nextThinking,
          thoughts: (m.thoughts ?? "") + delta,
        };
      });
      break;
    }
    case "THINKING_TEXT_MESSAGE_END":
    case "ThinkingTextMessageEnd":
    case "THINKING_END":
    case "ThinkingEnd":
      // Close the current thinking buffer; the contents are already
      // committed to state.
      break;

    // — Run lifecycle -----------------------------------------
    case "RUN_STARTED":
    case "RunStarted":
      // Live runs allocate the assistant slot in send() before this fires;
      // hydration relies on the snapshot pre-pass, so under both code
      // paths an assistant bubble already exists. We deliberately do NOT
      // create one here — that would interleave a stray empty bubble with
      // the snapshot-seeded conversation during hydration of multi-turn
      // sessions.
      break;
    case "RUN_FINISHED":
    case "RunFinished":
      setStatus("idle");
      updateLatestAssistant((m) => {
        if (m.role !== "assistant") return m;
        // Belt-and-suspenders snapshot hydration: if no streaming
        // deltas accumulated text but a MESSAGES_SNAPSHOT carried
        // an assistant message, hydrate from the snapshot now.
        if (
          (!m.text || m.text.trim().length === 0) &&
          snapshotRef.current
        ) {
          return {
            ...m,
            text: stripThink(snapshotRef.current),
            streaming: false,
            currentStep: undefined,
          };
        }
        return { ...m, streaming: false, currentStep: undefined };
      });
      break;
    case "RUN_ERROR":
    case "RunError":
      setStatus("error");
      setError(String(e.message ?? "run error"));
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? { ...m, streaming: false, currentStep: undefined }
          : m,
      );
      break;

    // — Step lifecycle ----------------------------------------
    // STEP_STARTED sets the active step name on the assistant
    // message so subsequent TEXT_MESSAGE_CONTENT deltas land in
    // the right buffer (opener / plan / text). STEP_FINISHED
    // clears it; if a new STEP_STARTED arrives it will overwrite
    // before any further text deltas land.
    case "STEP_STARTED":
    case "StepStarted": {
      const stepName = String(e.stepName ?? e.step_name ?? "");
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? { ...m, currentStep: stepName || m.currentStep }
          : m,
      );
      break;
    }
    case "STEP_FINISHED":
    case "StepFinished":
      updateLatestAssistant((m) =>
        m.role === "assistant" ? { ...m, currentStep: undefined } : m,
      );
      break;

    // — State / snapshot events --------------------------------
    case "STATE_DELTA":
    case "StateDelta":
    case "STATE_SNAPSHOT":
    case "StateSnapshot":
    case "RAW":
    case "Raw":
      break;
    case "MESSAGES_SNAPSHOT":
    case "MessagesSnapshot": {
      // LangGraph agents using `llm.invoke()` (the dominant pattern)
      // emit no TEXT_MESSAGE_CONTENT deltas — the assistant turn
      // arrives as a single MESSAGES_SNAPSHOT. Hydrate the in-flight
      // bubble's text from the latest assistant entry, but only
      // when no streaming deltas have already accumulated (don't
      // clobber token-streamed content).
      const snap = (e.messages ?? []) as Array<{
        role?: string;
        content?: string;
      }>;
      const lastAssistant = [...snap]
        .reverse()
        .find((x) => x.role === "assistant" || x.role === "ai");
      if (lastAssistant?.content) {
        const content = String(lastAssistant.content);
        // Stash for the RUN_FINISHED fallback in case the assistant
        // message hasn't been appended yet (defensive).
        snapshotRef.current = content;
        updateLatestAssistant((m) => {
          if (m.role !== "assistant") return m;
          if (!m.text || m.text.trim().length === 0) {
            return { ...m, text: stripThink(content) };
          }
          return m;
        });
      }
      break;
    }

    default:
      // Unhandled event types are intentionally silent — verbose
      // warning here would flood the console for proxy-only events.
      break;
  }
}

/**
 * Convert a persisted ``TraceEvent`` row into the ``AGUIEvent`` shape that
 * ``applyEvent`` expects. The trace row wraps the actual AG-UI event under
 * ``payload`` and stores the Pydantic class name (``MessagesSnapshotEvent``)
 * under ``event_type`` while the AG-UI ``type`` enum (``MESSAGES_SNAPSHOT``)
 * already lives inside ``payload.type``. Returning ``payload`` directly is
 * sufficient because both the in-flight SSE shape and the persisted shape
 * use the same field names (snake_case via ``model_dump``); the live
 * dispatch already tolerates the camelCase aliases as a defensive measure.
 */
function normalizeTraceEvent(row: unknown): AGUIEvent {
  if (typeof row === "object" && row !== null) {
    const r = row as { payload?: Record<string, unknown>; event_type?: string };
    if (r.payload && typeof r.payload === "object") {
      // payload.type is the AG-UI screaming-snake type literal. If the
      // payload is missing it (older rows / malformed entries), fall back
      // to event_type which holds the Python class name — applyEvent's
      // PascalCase aliases handle that shape too.
      const payload = r.payload as Record<string, unknown>;
      if (typeof payload.type === "string" && payload.type.length > 0) {
        return payload as AGUIEvent;
      }
      if (typeof r.event_type === "string") {
        return { ...payload, type: r.event_type } as AGUIEvent;
      }
    }
  }
  return row as AGUIEvent;
}

export function useChat(threadId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const eventIdRef = useRef(0);
  /**
   * Guard against the hydrate-vs-send race: if ``send()`` fires before the
   * hydration request resolves, the live stream's events would be clobbered
   * when the late getSessionEvents response calls setMessages/setEvents.
   * The ref starts true on every threadId change and is flipped false the
   * moment ``send()`` runs, telling the in-flight hydration to bail out.
   */
  const hydratableRef = useRef(true);

  // Reset + hydrate whenever the parent flips threadId. Clicking a row in
  // HistorySidebar pushes ``/?session=<sid>`` and the page-level component
  // re-derives ``threadId`` so this effect is the single switching point.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setEvents([]);
    setStatus("idle");
    setError(null);
    eventIdRef.current = 0;
    hydratableRef.current = true;

    let cancelled = false;
    (async () => {
      let res: { events: unknown[]; truncated: boolean } | null = null;
      try {
        res = await api.getSessionEvents(threadId);
      } catch (err) {
        // 404 / 401 / network — a fresh thread has no events. Stay silent
        // unless it's an auth error we can't paper over.
        if (err instanceof ApiError && err.status === 401) return;
        return;
      }
      if (cancelled || !res || !hydratableRef.current) return;

      const rawEvents = (res.events ?? []) as unknown[];

      // Pre-pass: seed the messages list from the latest MESSAGES_SNAPSHOT.
      // The snapshot is cumulative for LangGraph (StateGraph adds_messages
      // appends across turns), so the most recent snapshot in the trace
      // captures the full visible conversation. If the session never emits
      // a snapshot (e.g. tool-only flows), the messages list stays empty
      // and the per-event dispatch below rebuilds whatever it can.
      const seeded: Message[] = [];
      for (let i = rawEvents.length - 1; i >= 0; i--) {
        const ev = normalizeTraceEvent(rawEvents[i]);
        if (
          ev.type === "MESSAGES_SNAPSHOT" ||
          ev.type === "MessagesSnapshot" ||
          ev.type === "MessagesSnapshotEvent"
        ) {
          const snap = (ev.messages ?? []) as Array<{
            id?: string;
            role?: string;
            content?: unknown;
          }>;
          for (const m of snap) {
            const role =
              m.role === "user"
                ? ("user" as const)
                : m.role === "assistant" || m.role === "ai"
                  ? ("assistant" as const)
                  : null;
            if (!role) continue;
            const text = typeof m.content === "string" ? m.content : "";
            const id =
              typeof m.id === "string" && m.id.length > 0
                ? m.id
                : crypto.randomUUID();
            seeded.push(
              role === "user"
                ? { id, role, text }
                : {
                    id,
                    role,
                    text,
                    toolCalls: [],
                    thinking: [],
                    streaming: false,
                  },
            );
          }
          break;
        }
      }
      if (cancelled || !hydratableRef.current) return;
      if (seeded.length > 0) setMessages(seeded);

      // Per-event replay: dispatch tool/thinking/step/state events through
      // applyEvent so any non-snapshot detail (tool call results, thinking
      // text) shows up. Text content is intentionally driven by the
      // snapshot pre-pass to avoid double-applying deltas that already
      // landed in the snapshot's assistant content.
      const captured: ChatEvent[] = [];
      const snapshotRef: SnapshotRef = { current: null };
      const NON_TEXT_EVENTS = new Set([
        "TOOL_CALL_START",
        "TOOL_CALL_ARGS",
        "TOOL_CALL_END",
        "THINKING_START",
        "THINKING_TEXT_MESSAGE_START",
        "THINKING_TEXT_MESSAGE_CONTENT",
        "THINKING_TEXT_MESSAGE_END",
        "THINKING_END",
        "STEP_STARTED",
        "STEP_FINISHED",
      ]);
      for (const raw of rawEvents) {
        const ev = normalizeTraceEvent(raw);
        captured.push({ ...ev, _id: ++eventIdRef.current, _at: Date.now() });
        if (!hydratableRef.current) return;
        if (seeded.length > 0 && !NON_TEXT_EVENTS.has(String(ev.type))) {
          // Already covered by the snapshot pre-pass — skip text + run
          // lifecycle replays so we don't reset streaming flags or paint
          // empty text into the seeded bubbles.
          continue;
        }
        applyEvent(setMessages, setStatus, setError, snapshotRef, ev);
      }
      if (cancelled || !hydratableRef.current) return;
      // Final status is always idle after hydration — no live run is in
      // flight even if the persisted RUN_ERROR hasn't been replayed.
      setStatus("idle");
      setError(null);
      setEvents(
        captured.length > MAX_EVENTS
          ? captured.slice(captured.length - MAX_EVENTS)
          : captured,
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const send = useCallback(
    async (text: string) => {
      // Block any in-flight hydration from overwriting live state.
      hydratableRef.current = false;
      const runId = crypto.randomUUID();
      const userMsg: Message = { id: runId + "-u", role: "user", text };
      const assistantMsg: Message = {
        id: runId + "-a",
        role: "assistant",
        text: "",
        toolCalls: [],
        thinking: [],
        opener: "",
        plan: "",
        thoughts: "",
        streaming: true,
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setStatus("streaming");
      setError(null);

      abortRef.current = new AbortController();

      // Track the latest assistant content seen on a MESSAGES_SNAPSHOT so we
      // can hydrate the chat bubble at RUN_FINISHED for agents that emit no
      // TEXT_MESSAGE_CONTENT deltas (e.g. LangGraph using llm.invoke()).
      const snapshotRef: SnapshotRef = { current: null };

      try {
        await runAgent({
          threadId,
          runId,
          message: text,
          signal: abortRef.current.signal,
          onEvent: (e) => {
            // Capture every event for downstream surfaces (inspector layout,
            // dev console). The ring is capped to MAX_EVENTS.
            const captured: ChatEvent = {
              ...e,
              _id: ++eventIdRef.current,
              _at: Date.now(),
            };
            setEvents((prev) => {
              const next = [...prev, captured];
              return next.length > MAX_EVENTS
                ? next.slice(next.length - MAX_EVENTS)
                : next;
            });
            applyEvent(setMessages, setStatus, setError, snapshotRef, e);
          },
        });
      } catch (e: unknown) {
        const name = (e as { name?: string }).name;
        if (name !== "AbortError") {
          setStatus("error");
          setError((e as Error).message ?? "stream failed");
        } else {
          setStatus("idle");
        }
      } finally {
        // Whatever the run's outcome, the assistant message is no longer
        // streaming. RUN_FINISHED/RUN_ERROR will already have cleared this
        // for well-behaved streams; this guards against transport errors
        // that bypass the protocol's terminal events.
        setMessages((prev) =>
          prev.map((m) =>
            m.role === "assistant" && m.id === assistantMsg.id && m.streaming
              ? { ...m, streaming: false, currentStep: undefined }
              : m,
          ),
        );
      }
    },
    [threadId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, events, status, error, send, stop };
}
