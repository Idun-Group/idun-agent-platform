import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { A2UISurfaceWrapper } from "@/components/chat/a2ui/A2UISurfaceWrapper";
import type { A2UISurfaceState } from "@/lib/agui";

// Capture each onSurfaceCreated handler so tests can fire it synchronously.
const onSurfaceCreatedHandlers: Array<(s: { id: string }) => void> = [];

vi.mock("@a2ui/web_core/v0_9", () => ({
  MessageProcessor: vi.fn().mockImplementation(() => ({
    model: { dispose: vi.fn() },
    processMessages: vi.fn(),
    onSurfaceCreated: vi.fn((handler: (s: { id: string }) => void) => {
      onSurfaceCreatedHandlers.push(handler);
      return { unsubscribe: vi.fn() };
    }),
  })),
}));

vi.mock("@a2ui/react/v0_9", async () => {
  const React = await import("react");
  return {
    A2uiSurface: ({ surface }: { surface: { id: string } | null }) => (
      <div data-testid="a2ui-surface" data-surface-id={surface?.id} />
    ),
    basicCatalog: { id: "basic" },
    MarkdownContext: React.createContext<unknown>(undefined),
  };
});

vi.mock("@a2ui/markdown-it", () => ({
  renderMarkdown: vi.fn(async (text: string) => `<p>${text}</p>`),
}));

describe("A2UISurfaceWrapper", () => {
  beforeEach(() => {
    onSurfaceCreatedHandlers.length = 0;
  });

  it("creates a MessageProcessor with [basicCatalog] on mount", async () => {
    const { MessageProcessor } = await import("@a2ui/web_core/v0_9");
    const { basicCatalog } = await import("@a2ui/react/v0_9");
    const surface: A2UISurfaceState = {
      surfaceId: "s1",
      catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
      messages: [],
    };
    render(<A2UISurfaceWrapper surface={surface} />);

    // React dev mode may invoke ``useMemo`` factories more than once
    // for purity checks; assert at least once with the right shape.
    const mockedFn = MessageProcessor as unknown as ReturnType<typeof vi.fn>;
    expect(mockedFn.mock.calls.length).toBeGreaterThanOrEqual(1);
    // First positional arg is the catalogs array.
    for (const call of mockedFn.mock.calls) {
      expect(call[0]).toEqual([basicCatalog]);
    }
  });

  it("calls processMessages once with all initial messages on mount", async () => {
    const { MessageProcessor } = await import("@a2ui/web_core/v0_9");
    const surface: A2UISurfaceState = {
      surfaceId: "s1",
      catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
      messages: [
        { version: "v0.9", createSurface: { surfaceId: "s1", catalogId: "x" } },
        { version: "v0.9", updateComponents: { surfaceId: "s1", components: [] } },
      ],
    };
    render(<A2UISurfaceWrapper surface={surface} />);

    // React dev mode may invoke ``useMemo`` factories twice for purity
    // checks — only the latest constructed instance is the one the
    // component actually uses, so assert against ``mock.results[last]``.
    const results = (MessageProcessor as unknown as ReturnType<typeof vi.fn>).mock.results;
    const instance = results[results.length - 1].value as { processMessages: ReturnType<typeof vi.fn> };
    expect(instance.processMessages).toHaveBeenCalledTimes(1);
    expect(instance.processMessages).toHaveBeenCalledWith(surface.messages);
  });

  it("renders nothing before the processor signals onSurfaceCreated", () => {
    const surface: A2UISurfaceState = {
      surfaceId: "s1",
      catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
      messages: [],
    };
    const { queryByTestId, container } = render(<A2UISurfaceWrapper surface={surface} />);
    expect(queryByTestId("a2ui-surface")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders <A2uiSurface> after the processor signals onSurfaceCreated for the matching surfaceId", () => {
    const surface: A2UISurfaceState = {
      surfaceId: "abc",
      catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
      messages: [],
    };
    const { queryByTestId } = render(<A2UISurfaceWrapper surface={surface} />);

    // Capture the handler the wrapper registered.
    expect(onSurfaceCreatedHandlers.length).toBe(1);
    act(() => {
      onSurfaceCreatedHandlers[0]({ id: "abc" });
    });

    const node = queryByTestId("a2ui-surface");
    expect(node).not.toBeNull();
    expect(node?.getAttribute("data-surface-id")).toBe("abc");
  });

  it("ignores onSurfaceCreated callbacks for non-matching surfaceIds", () => {
    const surface: A2UISurfaceState = {
      surfaceId: "abc",
      catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
      messages: [],
    };
    const { queryByTestId } = render(<A2UISurfaceWrapper surface={surface} />);

    act(() => {
      onSurfaceCreatedHandlers[0]({ id: "different" });
    });

    expect(queryByTestId("a2ui-surface")).toBeNull();
  });

  it("replays the full message array to every processor instance under StrictMode", async () => {
    const React = await import("react");
    const { MessageProcessor } = await import("@a2ui/web_core/v0_9");
    const mockedFn = MessageProcessor as unknown as ReturnType<typeof vi.fn>;
    mockedFn.mockClear();

    const surface: A2UISurfaceState = {
      surfaceId: "s1",
      catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
      messages: [
        { version: "v0.9", createSurface: { surfaceId: "s1", catalogId: "x" } },
        { version: "v0.9", updateComponents: { surfaceId: "s1", components: [] } },
      ],
    };

    render(
      <React.StrictMode>
        <A2UISurfaceWrapper surface={surface} />
      </React.StrictMode>,
    );

    // StrictMode mounts → unmounts → remounts the component, and
    // useMemo factories may run extra times for purity checks. So
    // multiple processor instances may be constructed. The invariant:
    // every processor that ever sees processMessages must see the
    // *full* message array starting from index 0 — otherwise that
    // processor never got the createSurface envelope and the surface
    // would stay in the "render null" branch forever.
    const results = mockedFn.mock.results;
    expect(results.length).toBeGreaterThanOrEqual(2);

    let processorsThatProcessed = 0;
    for (const result of results) {
      const instance = result.value as { processMessages: ReturnType<typeof vi.fn> };
      for (const call of instance.processMessages.mock.calls) {
        expect(call[0]).toEqual(surface.messages);
        processorsThatProcessed++;
      }
    }
    expect(processorsThatProcessed).toBeGreaterThanOrEqual(2);
  });

  it("advances past a throwing batch so subsequent messages still flow through", async () => {
    const { MessageProcessor } = await import("@a2ui/web_core/v0_9");
    const mockedFn = MessageProcessor as unknown as ReturnType<typeof vi.fn>;
    mockedFn.mockClear();

    // Make the first call to processMessages throw, then succeed.
    const processMessages = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementation(() => undefined);

    mockedFn.mockImplementationOnce(() => ({
      model: { dispose: vi.fn() },
      processMessages,
      onSurfaceCreated: vi.fn((handler: (s: { id: string }) => void) => {
        onSurfaceCreatedHandlers.push(handler);
        return { unsubscribe: vi.fn() };
      }),
    }));

    const surface: A2UISurfaceState = {
      surfaceId: "s1",
      catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
      messages: [
        { version: "v0.9", createSurface: { surfaceId: "s1", catalogId: "x" } },
      ],
    };

    // Silence the expected console.error so the test output stays clean.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(<A2UISurfaceWrapper surface={surface} />);
    expect(processMessages).toHaveBeenCalledTimes(1);
    expect(processMessages).toHaveBeenNthCalledWith(1, surface.messages);

    const updated: A2UISurfaceState = {
      ...surface,
      messages: [
        ...surface.messages,
        { version: "v0.9", updateComponents: { surfaceId: "s1", components: [] } },
      ],
    };
    rerender(<A2UISurfaceWrapper surface={updated} />);

    // The counter must have advanced past the throwing batch, so the
    // second call is exactly the new tail — not the throwing batch + tail.
    expect(processMessages).toHaveBeenCalledTimes(2);
    expect(processMessages).toHaveBeenNthCalledWith(2, [updated.messages[1]]);

    errSpy.mockRestore();
  });
});
