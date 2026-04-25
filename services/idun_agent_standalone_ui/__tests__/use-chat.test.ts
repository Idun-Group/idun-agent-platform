import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

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
});
