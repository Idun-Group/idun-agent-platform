import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  renderHook as rtlRenderHook,
  type RenderHookOptions,
  act,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AGUIEvent, RunOptions } from "@/lib/agui";

// useChat now calls useQueryClient (so it can invalidate the
// agent-sessions cache after a run lands). Every renderHook in this
// file needs a QueryClientProvider in scope; we wrap it transparently
// via a local renderHook helper so the existing call sites stay short.
function renderHook<TProps, TResult>(
  callback: (props: TProps) => TResult,
  options?: Omit<RenderHookOptions<TProps>, "wrapper">,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return rtlRenderHook(callback, { ...options, wrapper });
}

// Mock the agui module so the hook never opens an SSE connection. We hand
// it back a pending promise so `send()` resolves only when we explicitly
// settle it; that lets us assert the optimistic state (user + assistant
// placeholder) before any stream events would arrive.
vi.mock("@/lib/agui", () => {
  return {
    runAgent: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the API module so hydration doesn't reach for window.fetch. By default
// every test sees an empty session detail (matching a fresh thread) — tests
// that exercise hydration override the resolved value explicitly.
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`API ${status}`);
    }
  }
  return {
    ApiError,
    api: {
      // SES.5: chat hydration now goes through the engine-backed
      // /agent/sessions/{id} endpoint. Returning ``null`` defaults to a
      // fresh-thread experience (no seeded messages) and matches the
      // catch(() => null) fallback in useChat.
      getAgentSession: vi.fn().mockResolvedValue(null),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't ship a real crypto.randomUUID in older builds; provide a
  // deterministic stub so message ids are stable in assertions.
  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => "test-uuid" },
      configurable: true,
    });
  }
});

describe("useChat", () => {
  it("appends a user message and an assistant placeholder on send", async () => {
    const { useChat } = await import("@/lib/use-chat");
    const { result } = renderHook(() => useChat("thread-1"));

    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.send("hello");
    });

    const roles = result.current.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant"]);

    const [user, assistant] = result.current.messages;
    expect(user.role).toBe("user");
    if (user.role === "user") {
      expect(user.text).toBe("hello");
    }

    expect(assistant.role).toBe("assistant");
    if (assistant.role === "assistant") {
      expect(assistant.text).toBe("");
      expect(assistant.toolCalls).toEqual([]);
      expect(assistant.thinking).toEqual([]);
    }
  });

  it("invokes runAgent with the threadId, runId, and message text", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("thread-xyz"));
    await act(async () => {
      await result.current.send("ping");
    });

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = (runAgent as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.threadId).toBe("thread-xyz");
    expect(call.message).toBe("ping");
    expect(typeof call.runId).toBe("string");
    expect(typeof call.onEvent).toBe("function");
  });

  it("routes TEXT_MESSAGE_CONTENT deltas into opener / plan / text by step", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    // Replay a scripted AG-UI sequence synchronously through onEvent so
    // we can assert the buffered slots without a real SSE stream. The
    // sequence exercises: acknowledge step → opener, planner step → plan,
    // responder step → text body, terminating with RUN_FINISHED.
    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "STEP_STARTED", stepName: "acknowledge" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "Hello" },
      { type: "STEP_FINISHED", stepName: "acknowledge" },
      { type: "STEP_STARTED", stepName: "planner" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "Step 1\nStep 2" },
      { type: "STEP_FINISHED", stepName: "planner" },
      { type: "STEP_STARTED", stepName: "responder" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "Final answer" },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-1"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    if (assistant && assistant.role === "assistant") {
      expect(assistant.opener).toBe("Hello");
      expect(assistant.plan).toBe("Step 1\nStep 2");
      expect(assistant.text).toBe("Final answer");
      expect(assistant.streaming).toBe(false);
    }
  });

  it("appends THINKING_TEXT_MESSAGE_CONTENT deltas to thoughts", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "THINKING_START" },
      { type: "THINKING_TEXT_MESSAGE_START" },
      { type: "THINKING_TEXT_MESSAGE_CONTENT", delta: "I should " },
      { type: "THINKING_TEXT_MESSAGE_CONTENT", delta: "reason carefully." },
      { type: "THINKING_TEXT_MESSAGE_END" },
      { type: "THINKING_END" },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-2"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.thoughts).toBe("I should reason carefully.");
      // The legacy `thinking[]` block buffer is also populated so any
      // remaining block-renderer consumers keep working.
      // THINKING_START and THINKING_TEXT_MESSAGE_START each open a buffer,
      // so the trailing buffer holds the joined text.
      expect(assistant.thinking[assistant.thinking.length - 1]).toBe(
        "I should reason carefully.",
      );
    }
  });

  it("strips <think>...</think> blocks from buffered text", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "<think>internal</think>visible" },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-3"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.text).toBe("visible");
    }
  });

  it("hydrates assistant text from MESSAGES_SNAPSHOT when streaming deltas are absent", async () => {
    // LangGraph agents using `llm.invoke()` emit no TEXT_MESSAGE_CONTENT
    // deltas — the assistant turn arrives only as a MESSAGES_SNAPSHOT.
    // Without snapshot hydration the chat would render an empty bubble.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "MESSAGES_SNAPSHOT",
        messages: [
          { role: "user", content: "ping" },
          { role: "assistant", content: "echo: ping" },
        ],
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-snap"));
    await act(async () => {
      await result.current.send("ping");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    if (assistant && assistant.role === "assistant") {
      expect(assistant.text).toBe("echo: ping");
      expect(assistant.streaming).toBe(false);
    }
    expect(result.current.status).toBe("idle");
  });

  it("hydrates assistant text from MESSAGES_SNAPSHOT using role='ai'", async () => {
    // Some adapters emit role: "ai" instead of role: "assistant" — the hook
    // should accept either.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "MessagesSnapshot",
        messages: [
          { role: "user", content: "ping" },
          { role: "ai", content: "ai-echo: ping" },
        ],
      },
      { type: "RunFinished" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-ai"));
    await act(async () => {
      await result.current.send("ping");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.text).toBe("ai-echo: ping");
    }
  });

  it("resets messages when threadId changes", async () => {
    // P3.2: clicking a session in HistorySidebar pushes a new threadId.
    // useChat must abort any in-flight stream and clear messages/events
    // synchronously before hydration runs against the new id.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "first answer" },
      { type: "RUN_FINISHED" },
    ];
    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result, rerender } = renderHook(
      ({ tid }: { tid: string }) => useChat(tid),
      { initialProps: { tid: "t1" } },
    );

    await act(async () => {
      await result.current.send("hello");
    });
    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.events.length).toBeGreaterThan(0);

    rerender({ tid: "t2" });

    // The reset path is synchronous — messages/events/status all clear in
    // the same effect tick. Hydration is async but the empty-events
    // default mock ensures the lists stay empty.
    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
      expect(result.current.events).toEqual([]);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("hydrates messages from getAgentSession on threadId change", async () => {
    // SES.5: after switching threads, useChat fetches the engine-backed
    // session detail and seeds messages from the reconstructed text-only
    // history. No event replay involved.
    const { api } = (await import("@/lib/api")) as unknown as {
      api: { getAgentSession: ReturnType<typeof vi.fn> };
    };
    const { useChat } = await import("@/lib/use-chat");

    // Mount fires hydration against "t1" too, then rerender against "t2"
    // — return the detail only for the "t2" call so the assertion
    // exercises the post-rerender hydration path specifically.
    api.getAgentSession.mockImplementation(async (id: string) => {
      if (id === "t2") {
        return {
          id: "t2",
          lastUpdateTime: null,
          userId: null,
          threadId: "t2",
          messages: [
            { id: "u1", role: "user", content: "ping", timestamp: null },
            {
              id: "a1",
              role: "assistant",
              content: "echo: ping",
              timestamp: null,
            },
          ],
        };
      }
      return null;
    });

    const { result, rerender } = renderHook(
      ({ tid }: { tid: string }) => useChat(tid),
      { initialProps: { tid: "t1" } },
    );

    rerender({ tid: "t2" });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (m) => m.role === "user" && m.text === "ping",
        ),
      ).toBe(true);
      expect(
        result.current.messages.some(
          (m) =>
            m.role === "assistant" &&
            typeof m.text === "string" &&
            m.text.includes("echo: ping"),
        ),
      ).toBe(true);
    });
    expect(result.current.status).toBe("idle");
  });

  it("does not overwrite streamed text when MESSAGES_SNAPSHOT also arrives", async () => {
    // Guards against clobbering: when both TEXT_MESSAGE_CONTENT deltas AND a
    // MESSAGES_SNAPSHOT arrive, the streamed text wins. The snapshot must
    // not overwrite tokens the user already saw.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "streamed " },
      { type: "TEXT_MESSAGE_CONTENT", delta: "answer" },
      {
        type: "MESSAGES_SNAPSHOT",
        messages: [
          { role: "user", content: "ping" },
          { role: "assistant", content: "something else" },
        ],
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-guard"));
    await act(async () => {
      await result.current.send("ping");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.text).toBe("streamed answer");
    }
  });

  it("captures tool result from TOOL_CALL_RESULT and leaves END alone empty", async () => {
    // Regression: earlier builds fabricated `result: "null"` from a
    // missing TOOL_CALL_END.result, causing every tool call to render
    // a `null` body. ag_ui_langgraph actually emits the result on a
    // separate TOOL_CALL_RESULT event with the real content.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        toolCallName: "search_idun_platform",
      },
      {
        type: "TOOL_CALL_ARGS",
        toolCallId: "tc-1",
        delta: '{"query": "guardrails"}',
      },
      { type: "TOOL_CALL_END", toolCallId: "tc-1" },
      {
        type: "TOOL_CALL_RESULT",
        toolCallId: "tc-1",
        content: "doc body about guardrails",
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-tool"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    if (assistant && assistant.role === "assistant") {
      expect(assistant.toolCalls).toHaveLength(1);
      const tc = assistant.toolCalls[0];
      expect(tc.id).toBe("tc-1");
      expect(tc.name).toBe("search_idun_platform");
      expect(tc.args).toBe('{"query": "guardrails"}');
      expect(tc.done).toBe(true);
      expect(tc.result).toBe("doc body about guardrails");
    }
  });

  it("workaround #629: extracts args from TOOL_CALL_START rawEvent when no ARGS event follows", async () => {
    // ag_ui_langgraph emits TOOL_CALL_START and returns without a
    // TOOL_CALL_ARGS event for Gemini's atomic tool calls. The args sit
    // on the raw chunk — pull them out at START time so the row body
    // isn't empty.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-atomic",
        toolCallName: "search_idun_platform",
        rawEvent: {
          data: {
            chunk: {
              tool_calls: [
                {
                  name: "search_idun_platform",
                  args: { query: "guardrails" },
                  id: "tc-atomic",
                },
              ],
            },
          },
        },
      },
      { type: "TOOL_CALL_END", toolCallId: "tc-atomic" },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-atomic"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    if (assistant && assistant.role === "assistant") {
      const tc = assistant.toolCalls[0];
      expect(tc.args).toBe('{"query":"guardrails"}');
    }
  });

  it("workaround #629: attaches TOOL_CALL_RESULT to latest unresolved call when ids mismatch", async () => {
    // ag_ui_langgraph emits TOOL_CALL_RESULT with LangGraph's run_id
    // as tool_call_id, not the LLM's. Fall back to the most recent
    // tool call without a result so the content lands somewhere.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "TOOL_CALL_START",
        toolCallId: "llm-id-abc",
        toolCallName: "search_idun_platform",
      },
      { type: "TOOL_CALL_END", toolCallId: "llm-id-abc" },
      {
        type: "TOOL_CALL_RESULT",
        toolCallId: "langgraph-run-xyz",
        content: "doc body about guardrails",
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-mismatch"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    if (assistant && assistant.role === "assistant") {
      const tc = assistant.toolCalls[0];
      expect(tc.id).toBe("llm-id-abc");
      expect(tc.result).toBe("doc body about guardrails");
    }
  });

  it("matches the right tool_calls entry by id when a chunk carries multiple tool calls", async () => {
    // Regression: previously the reducer always read tool_calls[0],
    // which attached the wrong args when the LLM emitted multiple
    // parallel tool calls in a single chunk. We now match by id.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-second",
        toolCallName: "lookup_b",
        rawEvent: {
          data: {
            chunk: {
              tool_calls: [
                { name: "lookup_a", args: { q: "first" }, id: "tc-first" },
                { name: "lookup_b", args: { q: "second" }, id: "tc-second" },
              ],
            },
          },
        },
      },
      { type: "TOOL_CALL_END", toolCallId: "tc-second" },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-multi-toolcall"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    if (assistant && assistant.role === "assistant") {
      const tc = assistant.toolCalls[0];
      // Args must come from the entry whose id matched the START event.
      expect(tc.args).toBe('{"q":"second"}');
    }
  });

  it("serialises a structured TOOL_CALL_RESULT.content instead of producing [object Object]", async () => {
    // Regression: `String(e.content)` coerced object payloads to
    // "[object Object]" before the row body ever rendered. We now
    // JSON.stringify non-string content with a defensive fallback.
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const structured = { hits: 2, items: ["a", "b"] };
    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "TOOL_CALL_START", toolCallId: "tc-3", toolCallName: "search" },
      { type: "TOOL_CALL_END", toolCallId: "tc-3" },
      { type: "TOOL_CALL_RESULT", toolCallId: "tc-3", content: structured },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-structured-result"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    if (assistant && assistant.role === "assistant") {
      const tc = assistant.toolCalls[0];
      expect(tc.result).toBe(JSON.stringify(structured, null, 2));
      expect(tc.result).not.toContain("[object Object]");
    }
  });

  it("leaves result undefined when only TOOL_CALL_END fires (no result event)", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "TOOL_CALL_START", toolCallId: "tc-2", toolCallName: "noop" },
      { type: "TOOL_CALL_END", toolCallId: "tc-2" },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) {
          opts.onEvent(event);
        }
      },
    );

    const { result } = renderHook(() => useChat("thread-noresult"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    if (assistant && assistant.role === "assistant") {
      const tc = assistant.toolCalls[0];
      expect(tc.done).toBe(true);
      expect(tc.result).toBeUndefined();
    }
  });
});
