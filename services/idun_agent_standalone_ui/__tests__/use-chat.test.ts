import { renderHook, act } from "@testing-library/react";
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
      // The legacy `thinking[]` block buffer is also populated so existing
      // consumers (ChatMessage's reasoning block renderer) keep working.
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
});
