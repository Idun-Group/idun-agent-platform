import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();

// Mock the telemetry barrel: capture() is the single fire-and-forget primitive
// every call site here uses. Stubbing identify/reset keeps the surface honest
// even though useChat doesn't call them.
vi.mock("@/lib/telemetry", () => ({
  capture: (...args: unknown[]) => captureMock(...args),
  identify: vi.fn(),
  reset: vi.fn(),
}));

// Stub the AG-UI runAgent call so we control the stream. We also re-export
// GuardrailRejectedError so the hook's catch-block instanceof check works
// against the mocked module.
vi.mock("@/lib/agui", () => ({
  runAgent: vi.fn(),
  GuardrailRejectedError: class GuardrailRejectedError extends Error {
    constructor(public reason: string) {
      super(reason);
      this.name = "GuardrailRejectedError";
    }
  },
}));

// Hydration must not touch fetch.
vi.mock("@/lib/api", () => ({
  api: { getAgentSession: vi.fn().mockResolvedValue(null) },
}));

import { runAgent } from "@/lib/agui";
import { useChat } from "@/lib/use-chat";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  captureMock.mockReset();
  (runAgent as ReturnType<typeof vi.fn>).mockReset();
  // jsdom older builds lack crypto.randomUUID — provide a deterministic stub.
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

afterEach(() => {});

describe("useChat telemetry", () => {
  it("emits chat.message.sent and agent.run.started on send", async () => {
    (runAgent as ReturnType<typeof vi.fn>).mockImplementation(async () => {});
    const { result } = renderHook(() => useChat("thread-1"), { wrapper });
    await act(async () => {
      await result.current.send("Hello world from a test");
    });
    expect(captureMock).toHaveBeenCalledWith("chat.message.sent", {
      session_id: "thread-1",
      length_chars: 23,
      length_words: 5,
    });
    expect(captureMock).toHaveBeenCalledWith(
      "agent.run.started",
      expect.objectContaining({
        agent_id: "default",
        session_id: "thread-1",
        message_index: 1,
      }),
    );
  });

  it("emits agent.run.error and chat.error with error_class on stream failure", async () => {
    (runAgent as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new TypeError("network");
    });
    const { result } = renderHook(() => useChat("thread-1"), { wrapper });
    await act(async () => {
      await result.current.send("hi");
    });
    expect(captureMock).toHaveBeenCalledWith(
      "agent.run.error",
      expect.objectContaining({
        agent_id: "default",
        session_id: "thread-1",
        error_class: "TypeError",
      }),
    );
    expect(captureMock).toHaveBeenCalledWith(
      "chat.error",
      expect.objectContaining({
        session_id: "thread-1",
        error_class: "TypeError",
        recoverable: true,
      }),
    );
  });
});
