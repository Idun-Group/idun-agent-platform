import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunOptions } from "@/lib/agui";

// Mock runAgent. The default implementation immediately fires RUN_FINISHED
// so a single sendAction()/send() call resolves quickly. Individual tests
// can override with mockImplementationOnce when they need to hold the run.
vi.mock("@/lib/agui", () => {
  return {
    runAgent: vi.fn(async (opts: RunOptions) => {
      opts.onEvent({ type: "RUN_FINISHED" });
    }),
  };
});

// Mock the API module so hydration doesn't reach for window.fetch.
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public detail: unknown,
    ) {
      super(`API ${status}`);
    }
  }
  return {
    ApiError,
    api: {
      getAgentSession: vi.fn().mockResolvedValue(null),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  if (
    !globalThis.crypto ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => "test-uuid" },
      configurable: true,
    });
  }
});

describe("useChat.sendAction", () => {
  const _action = {
    name: "submit_form",
    surfaceId: "s1",
    sourceComponentId: "btn",
    timestamp: "2026-05-05T00:00:00Z",
    context: {},
  };

  it("POSTs forwardedProps with idun.a2uiClientMessage", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("t1"));
    await act(async () => {
      await result.current.sendAction(_action, undefined);
    });

    expect(runAgent).toHaveBeenCalledTimes(1);
    const opts = (runAgent as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as RunOptions;
    expect(
      (opts.forwardedProps as { idun?: { a2uiClientMessage?: { action?: { name?: string } } } })
        ?.idun?.a2uiClientMessage?.action?.name,
    ).toBe("submit_form");
    expect(opts.message).toBeUndefined();
  });

  it("includes a2uiClientDataModel when provided", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("t1"));
    const dm = {
      version: "v0.9" as const,
      surfaces: { s1: { name: "alice" } },
    };
    await act(async () => {
      await result.current.sendAction(_action, dm);
    });
    const opts = (runAgent as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as RunOptions;
    expect(
      (opts.forwardedProps as { idun?: { a2uiClientDataModel?: unknown } })?.idun
        ?.a2uiClientDataModel,
    ).toEqual(dm);
  });

  it("omits a2uiClientDataModel when undefined", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("t1"));
    await act(async () => {
      await result.current.sendAction(_action, undefined);
    });
    const opts = (runAgent as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as RunOptions;
    const idun = (opts.forwardedProps as { idun?: Record<string, unknown> })
      ?.idun;
    expect(idun).toBeDefined();
    expect(idun).not.toHaveProperty("a2uiClientDataModel");
  });

  it("does not append a synthetic user message", async () => {
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("t1"));
    await act(async () => {
      await result.current.sendAction(_action, undefined);
    });
    const userMessages = result.current.messages.filter(
      (m) => m.role === "user",
    );
    expect(userMessages).toEqual([]);
  });

  it("appends an assistant placeholder for the streaming response", async () => {
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("t1"));
    await act(async () => {
      await result.current.sendAction(_action, undefined);
    });
    const assistants = result.current.messages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistants).toHaveLength(1);
  });

  it("flips status to streaming and back to idle", async () => {
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("t1"));
    expect(result.current.status).toBe("idle");
    await act(async () => {
      await result.current.sendAction(_action, undefined);
    });
    expect(result.current.status).toBe("idle");
  });

  it("is a no-op when status is not idle", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const runAgentMock = runAgent as unknown as {
      mock: { calls: unknown[][] };
      mockClear: () => void;
      mockImplementationOnce: (impl: (opts: RunOptions) => unknown) => void;
    };

    // Hold the first run open so status stays "streaming". We capture the
    // resolver so we can let the run finish at the end of the test (cleanup).
    let resolveFirst: () => void = () => {};
    runAgentMock.mockImplementationOnce(
      (opts: RunOptions) =>
        new Promise<void>((r) => {
          resolveFirst = () => {
            opts.onEvent({ type: "RUN_FINISHED" });
            r();
          };
        }),
    );

    const { result } = renderHook(() => useChat("t1"));
    void act(() => {
      void result.current.send("hello");
    });
    await waitFor(() => expect(result.current.status).toBe("streaming"));

    runAgentMock.mockClear();
    await act(async () => {
      await result.current.sendAction(_action, undefined);
    });
    expect(runAgentMock.mock.calls.length).toBe(0);

    // Cleanly resolve the held run so the test doesn't leak a pending promise.
    await act(async () => {
      resolveFirst();
    });
  });

  it("is a no-op against same-tick double-dispatch", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const { result } = renderHook(() => useChat("t1"));
    await act(async () => {
      // Fire twice synchronously — both should NOT fire runAgent.
      const p1 = result.current.sendAction(_action, undefined);
      const p2 = result.current.sendAction(_action, undefined);
      await Promise.all([p1, p2]);
    });
    // Exactly one runAgent call should have happened, despite two
    // synchronous invocations in the same tick.
    expect(runAgent).toHaveBeenCalledTimes(1);
  });
});
