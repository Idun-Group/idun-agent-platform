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
});
