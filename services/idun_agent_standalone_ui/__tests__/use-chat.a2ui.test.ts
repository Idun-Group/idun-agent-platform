import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AGUIEvent, RunOptions } from "@/lib/agui";

// Mock the agui module so the hook never opens an SSE connection. Tests
// drive applyEvent indirectly by feeding scripted events through onEvent.
vi.mock("@/lib/agui", () => {
  return {
    runAgent: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the API module so hydration doesn't reach for window.fetch.
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(public status: number, public detail: unknown) {
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
  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => "test-uuid" },
      configurable: true,
    });
  }
});

describe("useChat — CUSTOM idun.a2ui.messages", () => {
  it("creates a new A2UISurfaceState when a CUSTOM idun.a2ui.messages event arrives", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-1",
          fallbackText: "Hello surface",
          messages: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surf-1",
                catalogId: "https://example.com/catalog.json",
              },
            },
            {
              version: "v0.9",
              updateComponents: {
                surfaceId: "surf-1",
                components: [{ id: "c1" }],
              },
            },
          ],
        },
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-1"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toBeDefined();
      expect(assistant.a2uiSurfaces).toHaveLength(1);
      const surf = assistant.a2uiSurfaces![0];
      expect(surf.surfaceId).toBe("surf-1");
      expect(surf.catalogId).toBe("https://example.com/catalog.json");
      expect(surf.fallbackText).toBe("Hello surface");
      expect(surf.messages).toHaveLength(2);
    }
  });

  it("appends to an existing surface when the same surfaceId arrives again", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-1",
          messages: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surf-1",
                catalogId: "https://example.com/catalog.json",
              },
            },
          ],
        },
      },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-1",
          messages: [
            {
              version: "v0.9",
              updateComponents: {
                surfaceId: "surf-1",
                components: [{ id: "c1" }],
              },
            },
            {
              version: "v0.9",
              updateDataModel: {
                surfaceId: "surf-1",
                data: { count: 1 },
              },
            },
          ],
        },
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-2"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toHaveLength(1);
      const surf = assistant.a2uiSurfaces![0];
      expect(surf.surfaceId).toBe("surf-1");
      expect(surf.messages).toHaveLength(3);
      expect(surf.messages[0].createSurface).toBeDefined();
      expect(surf.messages[1].updateComponents).toBeDefined();
      expect(surf.messages[2].updateDataModel).toBeDefined();
    }
  });

  it("creates a separate surface entry for a new surfaceId", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-1",
          messages: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surf-1",
                catalogId: "https://example.com/cat-1.json",
              },
            },
          ],
        },
      },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-2",
          messages: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surf-2",
                catalogId: "https://example.com/cat-2.json",
              },
            },
          ],
        },
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-3"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toHaveLength(2);
      expect(assistant.a2uiSurfaces![0].surfaceId).toBe("surf-1");
      expect(assistant.a2uiSurfaces![0].catalogId).toBe(
        "https://example.com/cat-1.json",
      );
      expect(assistant.a2uiSurfaces![1].surfaceId).toBe("surf-2");
      expect(assistant.a2uiSurfaces![1].catalogId).toBe(
        "https://example.com/cat-2.json",
      );
    }
  });

  it("ignores CUSTOM events with other names", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "some.other.event",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-x",
          messages: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surf-x",
                catalogId: "https://example.com/x.json",
              },
            },
          ],
        },
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-4"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toBeUndefined();
    }
  });

  it("ignores malformed envelopes (null value)", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      { type: "CUSTOM", name: "idun.a2ui.messages", value: null },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-5"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toBeUndefined();
    }
  });

  it("ignores malformed envelopes (missing messages array)", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: { a2uiVersion: "v0.9", surfaceId: "surf-x", messages: undefined },
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-6"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toBeUndefined();
    }
  });

  it("uses default catalogId when createSurface is not in the messages", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-default",
          messages: [
            {
              version: "v0.9",
              updateComponents: {
                surfaceId: "surf-default",
                components: [{ id: "c1" }],
              },
            },
          ],
        },
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-7"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toHaveLength(1);
      expect(assistant.a2uiSurfaces![0].catalogId).toBe(
        "https://a2ui.org/specification/v0_9/basic_catalog.json",
      );
    }
  });

  it("preserves existing fallbackText when a follow-up envelope omits it", async () => {
    const { runAgent } = await import("@/lib/agui");
    const { useChat } = await import("@/lib/use-chat");

    const script: AGUIEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-fb",
          fallbackText: "first",
          messages: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surf-fb",
                catalogId: "https://example.com/fb.json",
              },
            },
          ],
        },
      },
      {
        type: "CUSTOM",
        name: "idun.a2ui.messages",
        value: {
          a2uiVersion: "v0.9",
          surfaceId: "surf-fb",
          messages: [
            {
              version: "v0.9",
              updateComponents: {
                surfaceId: "surf-fb",
                components: [{ id: "c1" }],
              },
            },
          ],
        },
      },
      { type: "RUN_FINISHED" },
    ];

    (runAgent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (opts: RunOptions) => {
        for (const event of script) opts.onEvent(event);
      },
    );

    const { result } = renderHook(() => useChat("thread-a2ui-8"));
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    if (assistant && assistant.role === "assistant") {
      expect(assistant.a2uiSurfaces).toHaveLength(1);
      expect(assistant.a2uiSurfaces![0].fallbackText).toBe("first");
    }
  });
});
