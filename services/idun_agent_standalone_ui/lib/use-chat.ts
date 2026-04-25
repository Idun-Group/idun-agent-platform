"use client";

import { useCallback, useRef, useState } from "react";
import { type Message, runAgent } from "@/lib/agui";

type Status = "idle" | "streaming" | "error";

export function useChat(threadId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

      try {
        await runAgent({
          threadId,
          runId,
          message: text,
          signal: abortRef.current.signal,
          onEvent: (e) => {
            const t = String(e.type ?? "");
            switch (t) {
              case "TEXT_MESSAGE_CONTENT":
              case "TextMessageContent":
                updateAssistant((m) =>
                  m.role === "assistant"
                    ? { ...m, text: m.text + ((e.delta as string) ?? "") }
                    : m,
                );
                break;
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
              case "THINKING_START":
              case "ThinkingStart":
                updateAssistant((m) =>
                  m.role === "assistant"
                    ? { ...m, thinking: [...m.thinking, ""] }
                    : m,
                );
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

  return { messages, status, error, send, stop };
}
