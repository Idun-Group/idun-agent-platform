import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// MessageView indirectly imports ReasoningPanel → ToolCallRow → react-syntax-highlighter,
// whose ESM-only entry points choke on jsdom + Vitest transform. Stub Prism
// to a plain <pre>{children}</pre> so the import graph resolves.
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

import { MessageView } from "@/components/chat/MessageView";

describe("MessageView", () => {
  it("renders a user message inside a right-aligned ink bubble", () => {
    const { container } = render(
      <MessageView m={{ id: "u1", role: "user", text: "hi" }} />,
    );

    // The user-bubble layout uses `justify-end` on the wrapper; assert that
    // the rendered text lives inside such a wrapper.
    const wrapper = container.querySelector(".justify-end");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.textContent).toContain("hi");
  });

  it("renders an assistant text body via ReactMarkdown", () => {
    render(
      <MessageView
        m={{
          id: "a1",
          role: "assistant",
          text: "hello world",
          toolCalls: [],
          thinking: [],
        }}
      />,
    );

    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("renders three pulsing dots when assistant is streaming with no content yet", () => {
    const { container } = render(
      <MessageView
        m={{
          id: "a2",
          role: "assistant",
          text: "",
          toolCalls: [],
          thinking: [],
          streaming: true,
        }}
      />,
    );

    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots).toHaveLength(3);
  });

  it("renders both opener and final text when assistant has both", () => {
    render(
      <MessageView
        m={{
          id: "a3",
          role: "assistant",
          opener: "Sure!",
          text: "Final answer",
          toolCalls: [],
          thinking: [],
        }}
      />,
    );

    expect(screen.getByText("Sure!")).toBeInTheDocument();
    expect(screen.getByText("Final answer")).toBeInTheDocument();
  });
});
