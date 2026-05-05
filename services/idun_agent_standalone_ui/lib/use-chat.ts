"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { A2uiClientAction, A2uiClientDataModel } from "@a2ui/web_core/v0_9";
import {
  type AGUIEvent,
  GuardrailRejectedError,
  type IdunA2UIEvent,
  type IdunForwardedProps,
  type Message,
  runAgent,
} from "@/lib/agui";
import { api } from "@/lib/api";

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
 * TEXT_MESSAGE_CONTENT deltas accumulated text. Sits in ``send()``'s
 * closure for the duration of a single live run. */
type SnapshotRef = { current: string | null };

/**
 * Apply a single AG-UI event to the chat state.
 *
 * Used exclusively by the live SSE stream callback in ``send()``. Hydration
 * (post-SES.5) goes through the engine-backed ``GET /agent/sessions/{id}``
 * endpoint and seeds ``messages`` directly from the response, so this
 * reducer is no longer driven from a persisted-event replay path.
 *
 * The function is intentionally side-effecty (calls setMessages / setStatus
 * / setError) but pure with respect to its inputs — the caller decides
 * which setters to wire in. ``snapshotRef.current`` is mutated when a
 * MESSAGES_SNAPSHOT carries an assistant message so RUN_FINISHED can
 * hydrate the bubble even if no streaming deltas accumulated text.
 *
 * Events arrive over the live SSE stream snake_case for nested fields, but
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
  // bubble that's currently streaming. ``send()`` allocates one explicitly
  // before any AG-UI events arrive, so the walk below always finds it.
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

    // — Thinking / Reasoning lifecycle ------------------------
    // ag-ui-langgraph 0.0.35+ emits REASONING_* events; older
    // engines emit THINKING_*. Keep both for back-compat.
    case "THINKING_START":
    case "ThinkingStart":
    case "REASONING_START":
    case "ReasoningStart":
    case "THINKING_TEXT_MESSAGE_START":
    case "ThinkingTextMessageStart":
    case "REASONING_TEXT_MESSAGE_START":
    case "ReasoningTextMessageStart":
      updateLatestAssistant((m) =>
        m.role === "assistant"
          ? { ...m, thinking: [...m.thinking, ""] }
          : m,
      );
      break;
    case "THINKING_TEXT_MESSAGE_CONTENT":
    case "ThinkingTextMessageContent":
    case "REASONING_TEXT_MESSAGE_CONTENT":
    case "ReasoningTextMessageContent": {
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
    case "REASONING_TEXT_MESSAGE_END":
    case "ReasoningTextMessageEnd":
    case "THINKING_END":
    case "ThinkingEnd":
    case "REASONING_END":
    case "ReasoningEnd":
      // Close the current thinking buffer; the contents are already
      // committed to state.
      break;

    // — Run lifecycle -----------------------------------------
    case "RUN_STARTED":
    case "RunStarted":
      // Live runs allocate the assistant slot in send() before this fires,
      // so an assistant bubble always exists by the time RUN_STARTED arrives.
      // We deliberately do NOT create one here.
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

    // — A2UI surface envelopes (WS2) -------------------------
    // Engine emits ``CUSTOM`` events with ``name: "idun.a2ui.messages"``
    // carrying an A2UI v0.9 envelope. Each event is keyed by ``surfaceId``;
    // first sighting allocates an A2UISurfaceState (deriving catalogId from
    // a createSurface message if present, else falling back to the basic
    // catalog default), follow-ups append messages to the existing entry.
    case "CUSTOM":
    case "CustomEvent": {
      const name = String(e.name ?? "");
      if (name !== "idun.a2ui.messages") break;

      const value = e.value as IdunA2UIEvent | undefined;
      if (!value || !Array.isArray(value.messages) || !value.surfaceId) {
        break;
      }

      updateLatestAssistant((m) => {
        if (m.role !== "assistant") return m;

        const surfaces = m.a2uiSurfaces ?? [];
        const idx = surfaces.findIndex(
          (s) => s.surfaceId === value.surfaceId,
        );

        if (idx === -1) {
          // First time we see this surface — derive catalogId from
          // createSurface if present, else default.
          const createMsg = value.messages.find((msg) => msg.createSurface);
          const catalogId =
            createMsg?.createSurface?.catalogId ??
            "https://a2ui.org/specification/v0_9/basic_catalog.json";
          return {
            ...m,
            a2uiSurfaces: [
              ...surfaces,
              {
                surfaceId: value.surfaceId,
                catalogId,
                messages: value.messages,
                fallbackText: value.fallbackText,
              },
            ],
          };
        }

        const next = [...surfaces];
        next[idx] = {
          ...next[idx],
          messages: [...next[idx].messages, ...value.messages],
          fallbackText: value.fallbackText ?? next[idx].fallbackText,
        };
        return { ...m, a2uiSurfaces: next };
      });
      break;
    }

    default:
      // Unhandled event types are intentionally silent — verbose
      // warning here would flood the console for proxy-only events.
      break;
  }
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
   * when the late getAgentSession response calls setMessages.
   * The ref starts true on every threadId change and is flipped false the
   * moment ``send()`` runs, telling the in-flight hydration to bail out.
   */
  const hydratableRef = useRef(true);

  // Reset + hydrate whenever the parent flips threadId. Clicking a row in
  // HistorySidebar pushes ``/?session=<sid>`` and the page-level component
  // re-derives ``threadId`` so this effect is the single switching point.
  //
  // SES.5: hydration now uses the engine-backed ``GET /agent/sessions/{id}``
  // endpoint. The engine returns reconstructed text-only messages directly
  // (per spec §8 and design D3), so we map ``SessionMessage`` → ``Message``
  // without replaying any AG-UI event reducer. The live streaming path in
  // ``send()`` still uses ``applyEvent`` against fresh AG-UI events.
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
      // 404 = unknown thread (fresh session); 501 = adapter doesn't support
      // the get-by-id call. Either way the chat starts blank — bail silently.
      // Auth (401) is handled centrally by ``apiFetch``'s redirect path so we
      // don't need to special-case it here.
      const detail = await api.getAgentSession(threadId).catch(() => null);
      if (cancelled || !hydratableRef.current) return;
      if (!detail || detail.messages.length === 0) return;

      const seeded: Message[] = detail.messages.map((m) =>
        m.role === "user"
          ? { id: m.id, role: "user" as const, text: m.content }
          : {
              id: m.id,
              role: "assistant" as const,
              text: m.content,
              toolCalls: [],
              thinking: [],
              streaming: false,
            },
      );
      setMessages(seeded);
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
        if (e instanceof GuardrailRejectedError) {
          setStatus("idle");
          setError(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "assistant" && m.id === assistantMsg.id
                ? { ...m, text: e.reason, streaming: false }
                : m,
            ),
          );
        } else if (name !== "AbortError") {
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

  /**
   * Send an A2UI action turn. Mirrors ``send(text)`` but skips the synthetic
   * user-message bubble (action turns aren't user utterances) and POSTs the
   * action via ``forwardedProps.idun.a2uiClientMessage`` instead of a chat
   * message. The optional ``dataModel`` snapshot is forwarded under
   * ``a2uiClientDataModel`` so the engine can hydrate server-side state.
   *
   * No-op when ``status !== "idle"``: the wrapper already gates click delivery
   * via ``isInteractive`` (T10), but a programmatic call mid-stream should
   * also be ignored to keep the run pipeline single-tracked.
   */
  const sendAction = useCallback(
    async (
      action: A2uiClientAction,
      dataModel: A2uiClientDataModel | undefined,
    ): Promise<void> => {
      if (status !== "idle") return;

      hydratableRef.current = false;
      const runId = crypto.randomUUID();
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
      setMessages((m) => [...m, assistantMsg]);
      setStatus("streaming");
      setError(null);

      abortRef.current = new AbortController();
      const snapshotRef: SnapshotRef = { current: null };

      const forwardedProps: IdunForwardedProps = {
        idun: {
          a2uiClientMessage: { version: "v0.9", action },
          ...(dataModel ? { a2uiClientDataModel: dataModel } : {}),
        },
      };

      try {
        await runAgent({
          threadId,
          runId,
          forwardedProps: forwardedProps as unknown as Record<string, unknown>,
          signal: abortRef.current.signal,
          onEvent: (e) => {
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
        if (e instanceof GuardrailRejectedError) {
          setStatus("idle");
          setError(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "assistant" && m.id === assistantMsg.id
                ? { ...m, text: e.reason, streaming: false }
                : m,
            ),
          );
        } else if (name !== "AbortError") {
          setStatus("error");
          setError((e as Error).message ?? "stream failed");
        } else {
          setStatus("idle");
        }
      } finally {
        setMessages((prev) =>
          prev.map((m) =>
            m.role === "assistant" && m.id === assistantMsg.id && m.streaming
              ? { ...m, streaming: false, currentStep: undefined }
              : m,
          ),
        );
      }
    },
    [threadId, status],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, events, status, error, send, sendAction, stop };
}

/** Value exposed by ChatActionsContext — currently just ``sendAction``. */
type ChatActionsContextValue = {
  sendAction: (
    action: A2uiClientAction,
    dataModel: A2uiClientDataModel | undefined,
  ) => Promise<void>;
};

/**
 * Lightweight Context for components nested deep in the chat tree
 * (e.g., A2UISurfaceWrapper in T10). The Provider is wired in T11
 * by the chat page that owns useChat.
 */
export const ChatActionsContext = createContext<ChatActionsContextValue | null>(
  null,
);

export function useChatActions(): ChatActionsContextValue {
  const ctx = useContext(ChatActionsContext);
  if (ctx === null) {
    throw new Error(
      "useChatActions called outside <ChatActionsContext.Provider>",
    );
  }
  return ctx;
}
