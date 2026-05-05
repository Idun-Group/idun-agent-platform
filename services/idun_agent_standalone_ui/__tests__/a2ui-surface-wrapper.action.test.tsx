import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { A2UISurfaceWrapper } from "@/components/chat/a2ui/A2UISurfaceWrapper";
import type { A2UISurfaceState } from "@/lib/agui";

// Capture each actionHandler the wrapper passes to MessageProcessor.
const _capturedHandlers: Array<(a: any) => void> = [];

const _stubProcessor = {
  model: { dispose: vi.fn() },
  processMessages: vi.fn(),
  onSurfaceCreated: vi.fn((handler: (s: { id: string }) => void) => {
    queueMicrotask(() => handler({ id: "s1" }));
    return { unsubscribe: vi.fn() };
  }),
  getClientDataModel: vi.fn(() => ({
    version: "v0.9",
    surfaces: { s1: { name: "alice" } },
  })),
};

vi.mock("@a2ui/web_core/v0_9", () => ({
  MessageProcessor: vi.fn().mockImplementation(
    (_catalogs: unknown[], handler?: (a: any) => void) => {
      if (handler) _capturedHandlers.push(handler);
      return _stubProcessor;
    },
  ),
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
  renderMarkdown: vi.fn(async (t: string) => `<p>${t}</p>`),
}));

const _sendAction = vi.fn();
vi.mock("@/lib/use-chat", async () => {
  const actual = await vi.importActual<any>("@/lib/use-chat");
  return {
    ...actual,
    useChatActions: () => ({ sendAction: _sendAction }),
  };
});

const _surface: A2UISurfaceState = {
  surfaceId: "s1",
  catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
  messages: [],
};
const _action = {
  name: "submit_form", surfaceId: "s1", sourceComponentId: "btn",
  timestamp: "2026-05-05T00:00:00Z", context: {},
};

describe("A2UISurfaceWrapper action wiring", () => {
  beforeEach(() => {
    _capturedHandlers.length = 0;
    _sendAction.mockClear();
    _stubProcessor.processMessages.mockClear();
    _stubProcessor.getClientDataModel.mockClear();
  });

  it("forwards action to sendAction with dataModel snapshot when interactive", () => {
    render(<A2UISurfaceWrapper surface={_surface} isInteractive={true} />);
    expect(_capturedHandlers).toHaveLength(1);
    act(() => { _capturedHandlers[0](_action); });
    expect(_sendAction).toHaveBeenCalledTimes(1);
    expect(_sendAction).toHaveBeenCalledWith(_action, expect.objectContaining({
      version: "v0.9",
    }));
  });

  it("no-ops when not interactive", () => {
    render(<A2UISurfaceWrapper surface={_surface} isInteractive={false} />);
    expect(_capturedHandlers).toHaveLength(1);
    act(() => { _capturedHandlers[0](_action); });
    expect(_sendAction).not.toHaveBeenCalled();
  });

  it("applies pointer-events-none class when not interactive", async () => {
    const { container, findByTestId } = render(
      <A2UISurfaceWrapper surface={_surface} isInteractive={false} />,
    );
    // Wait for the onSurfaceCreated microtask + React state flush.
    await findByTestId("a2ui-surface");
    const root = container.querySelector(".a2ui-surface");
    expect(root?.className).toContain("pointer-events-none");
  });

  it("does not apply pointer-events-none when interactive", async () => {
    const { container, findByTestId } = render(
      <A2UISurfaceWrapper surface={_surface} isInteractive={true} />,
    );
    await findByTestId("a2ui-surface");
    const root = container.querySelector(".a2ui-surface");
    expect(root?.className).not.toContain("pointer-events-none");
  });
});
