import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AGUIEvent, RunOptions } from "@/lib/agui";

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
// every test sees an empty trace history (matching a fresh thread) — tests
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
      getSessionEvents: vi.fn().mockResolvedValue({
        events: [],
        truncated: false,
      }),
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

  it("hydrates messages from MESSAGES_SNAPSHOT on threadId change", async () => {
    // P3.2: after switching threads, useChat replays persisted trace
    // events. The pre-pass scans for the latest MESSAGES_SNAPSHOT and
    // seeds the chat from it (cumulative under LangGraph's add_messages).
    const { api } = (await import("@/lib/api")) as unknown as {
      api: { getSessionEvents: ReturnType<typeof vi.fn> };
    };
    const { useChat } = await import("@/lib/use-chat");

    // Mount fires hydration against "t1" too, then rerender against "t2"
    // — return the snapshot only for the "t2" call so the assertion
    // exercises the post-rerender hydration path specifically.
    api.getSessionEvents.mockImplementation(async (id: string) => {
      if (id === "t2") {
        return {
          events: [
            {
              id: 1,
              session_id: "t2",
              run_id: "r1",
              sequence: 0,
              event_type: "MessagesSnapshotEvent",
              payload: {
                type: "MESSAGES_SNAPSHOT",
                messages: [
                  { id: "u1", role: "user", content: "ping" },
                  { id: "a1", role: "assistant", content: "echo: ping" },
                ],
              },
              created_at: "2026-04-26T00:00:00Z",
            },
          ],
          truncated: false,
        };
      }
      return { events: [], truncated: false };
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
});
