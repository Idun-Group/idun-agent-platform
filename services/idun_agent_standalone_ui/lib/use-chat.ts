"use client";

import { useCallback, useRef, useState } from "react";
import { type AGUIEvent, type Message, runAgent } from "@/lib/agui";

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

export function useChat(threadId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const eventIdRef = useRef(0);

  const send = useCallback(
    async (text: string) => {
      const runId = crypto.randomUUID();
      const userMsg: Message = { id: runId + "-u", role: "user", text };
      const assistantMsg: Message = {
        id: runId + "-a",
        role: "assistant",
        text: "",
        toolCalls: [],
        thinking: [],
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setStatus("streaming");
      setError(null);

      abortRef.current = new AbortController();

      const updateAssistant = (fn: (m: Message) => Message) =>
        setMessages((prev) =>
          prev.map((x) => (x.id === assistantMsg.id ? fn(x) : x)),
        );

      // Track open text segments so we can append content to the right slot.
      // Today the chat renders a single bubble per assistant message; START/END
      // are handled but don't yet split text into multiple segments client-side.
      // Thinking blocks are append-only — START allocates a buffer, CONTENT
      // appends to the last buffer, END is a no-op.

      try {
        await runAgent({
          threadId,
          runId,
          message: text,
          signal: abortRef.current.signal,
          onEvent: (e) => {
            const t = String(e.type ?? "");
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
            switch (t) {
              // — Text lifecycle ----------------------------------------
              case "TEXT_MESSAGE_START":
              case "TextMessageStart":
                // Pragmatic: today we already accumulate into a single bubble.
                // If the buffer is non-empty we leave it alone; downstream
                // consumers can split on START boundaries when the UX needs it.
                break;
              case "TEXT_MESSAGE_CONTENT":
              case "TextMessageContent":
                updateAssistant((m) =>
                  m.role === "assistant"
                    ? { ...m, text: m.text + ((e.delta as string) ?? "") }
                    : m,
                );
                break;
              case "TEXT_MESSAGE_END":
              case "TextMessageEnd":
                // Close the current text segment. With the single-bubble model
                // there's nothing to do — the buffer is already final.
                break;

              // — Tool call lifecycle -----------------------------------
              case "TOOL_CALL_START":
              case "ToolCallStart":
                updateAssistant((m) =>
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
                updateAssistant((m) =>
                  m.role === "assistant"
                    ? {
                        ...m,
                        toolCalls: m.toolCalls.map((tc) =>
                          tc.id ===
                          String(e.toolCallId ?? e.tool_call_id ?? "")
                            ? { ...tc, args: tc.args + ((e.delta as string) ?? "") }
                            : tc,
                        ),
                      }
                    : m,
                );
                break;
              case "TOOL_CALL_END":
              case "ToolCallEnd":
                updateAssistant((m) =>
                  m.role === "assistant"
                    ? {
                        ...m,
                        toolCalls: m.toolCalls.map((tc) =>
                          tc.id ===
                          String(e.toolCallId ?? e.tool_call_id ?? "")
                            ? { ...tc, result: JSON.stringify(e.result ?? null) }
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
                updateAssistant((m) =>
                  m.role === "assistant"
                    ? { ...m, thinking: [...m.thinking, ""] }
                    : m,
                );
                break;
              case "THINKING_TEXT_MESSAGE_CONTENT":
              case "ThinkingTextMessageContent":
                updateAssistant((m) => {
                  if (m.role !== "assistant") return m;
                  const idx = m.thinking.length - 1;
                  if (idx < 0)
                    return {
                      ...m,
                      thinking: [String(e.delta ?? "")],
                    };
                  const next = m.thinking.slice();
                  next[idx] = next[idx] + String(e.delta ?? "");
                  return { ...m, thinking: next };
                });
                break;
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
                // No-op; status is already 'streaming' from send().
                break;
              case "RUN_FINISHED":
              case "RunFinished":
                setStatus("idle");
                break;
              case "RUN_ERROR":
              case "RunError":
                setStatus("error");
                setError(String(e.message ?? "run error"));
                break;

              // — Step / state events (no-op for this UI) ---------------
              case "STEP_STARTED":
              case "StepStarted":
              case "STEP_FINISHED":
              case "StepFinished":
              case "STATE_DELTA":
              case "StateDelta":
              case "STATE_SNAPSHOT":
              case "StateSnapshot":
              case "MESSAGES_SNAPSHOT":
              case "MessagesSnapshot":
              case "RAW":
              case "Raw":
                break;

              default:
                // Unhandled event types are intentionally silent — verbose
                // warning here would flood the console for proxy-only events.
                break;
            }
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
      }
    },
    [threadId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, events, status, error, send, stop };
}
