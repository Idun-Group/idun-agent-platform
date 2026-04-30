import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// MessageView indirectly imports ReasoningPanel → ToolCallRow →
// react-syntax-highlighter, whose ESM-only entry points choke on jsdom +
// Vitest transform. Stub Prism to a plain <pre>{children}</pre> so the import
// graph resolves. Mirrors the stubs used in message-view.test.tsx.
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: React.ReactNode }) => <pre>{children}</pre>,
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: {},
}));

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeConfig: () => ({
    theme: {
      appName: "Idun Agent",
      greeting: "How can I help?",
      starterPrompts: [],
      logo: { text: "IA" },
      layout: "branded",
      colors: { light: {}, dark: {} },
      radius: "0.625",
      fontSans: "",
      fontSerif: "",
      fontMono: "",
      defaultColorScheme: "system",
    },
    authMode: "none",
    layout: "branded",
  }),
}));

// Mock the wrapper component — MessageView's job is to compose it,
// not to drive the real @a2ui/react renderer. The wrapper has its
// own dedicated tests in __tests__/a2ui-surface-wrapper.test.tsx.
vi.mock("@/components/chat/a2ui/A2UISurfaceWrapper", () => ({
  A2UISurfaceWrapper: ({ surface }: { surface: { surfaceId: string } }) => (
    <div data-testid="a2ui-surface" data-surface-id={surface.surfaceId} />
  ),
}));

import { MessageView } from "@/components/chat/MessageView";
import type { Message } from "@/lib/agui";

function makeAssistant(overrides: Record<string, unknown> = {}): Message {
  return {
    id: "m1",
    role: "assistant",
    text: "hello",
    thinking: [],
    toolCalls: [],
    ...overrides,
  } as Message;
}

describe("MessageView — A2UI", () => {
  it("renders no A2UI surface when a2uiSurfaces is undefined", () => {
    const m = makeAssistant();
    const { queryAllByTestId } = render(<MessageView m={m} />);
    expect(queryAllByTestId("a2ui-surface")).toHaveLength(0);
  });

  it("renders one A2UISurfaceWrapper per a2uiSurfaces entry", () => {
    const m = makeAssistant({
      a2uiSurfaces: [
        { surfaceId: "s1", catalogId: "x", messages: [] },
        { surfaceId: "s2", catalogId: "x", messages: [] },
      ],
    });
    const { queryAllByTestId } = render(<MessageView m={m} />);
    const surfaces = queryAllByTestId("a2ui-surface");
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0].getAttribute("data-surface-id")).toBe("s1");
    expect(surfaces[1].getAttribute("data-surface-id")).toBe("s2");
  });

  it("renders text body before the first A2UI surface in DOM order", () => {
    const m = makeAssistant({
      text: "summary text",
      a2uiSurfaces: [{ surfaceId: "s", catalogId: "x", messages: [] }],
    });
    const { container, getByTestId } = render(<MessageView m={m} />);

    // The summary text appears somewhere in the DOM.
    expect(container.textContent).toContain("summary text");

    // The text node containing "summary text" must precede the surface.
    const surfaceNode = getByTestId("a2ui-surface");
    const textWalker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
    );
    let textBeforeSurface = false;
    let node: Node | null = textWalker.nextNode();
    while (node) {
      if (node.textContent?.includes("summary text")) {
        // Compare positions via compareDocumentPosition.
        const pos = node.compareDocumentPosition(surfaceNode);
        // DOCUMENT_POSITION_FOLLOWING means surfaceNode is AFTER node.
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
          textBeforeSurface = true;
        }
        break;
      }
      node = textWalker.nextNode();
    }
    expect(textBeforeSurface).toBe(true);
  });
});
