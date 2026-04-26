import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// react-syntax-highlighter ships ESM-only entry points that jsdom + Vitest
// transform can choke on; we never need real highlighting in unit tests, so
// stub Prism to a plain <pre>{children}</pre>.
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: React.ReactNode }) => <pre>{children}</pre>,
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: {},
}));

import type { ToolCall } from "@/lib/agui";
import { ReasoningPanel } from "@/components/chat/ReasoningPanel";
import { ToolCallRow } from "@/components/chat/ToolCallRow";

describe("ReasoningPanel", () => {
  it("renders nothing when plan/thoughts/toolCalls are all empty", () => {
    const { container } = render(
      <ReasoningPanel toolCalls={[]} streaming={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows 'Reasoning · 2 steps' header and stays collapsed by default when not streaming", () => {
    const toolCalls: ToolCall[] = [
      { id: "a", name: "foo", args: "" },
      { id: "b", name: "bar", args: "" },
    ];
    render(<ReasoningPanel toolCalls={toolCalls} streaming={false} />);

    expect(screen.getByText("Reasoning · 2 steps")).toBeInTheDocument();
    // Collapsed: the body's "Actions" section heading is not in the DOM.
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("toggles open when the header is clicked", () => {
    const toolCalls: ToolCall[] = [
      { id: "a", name: "foo", args: "" },
      { id: "b", name: "bar", args: "" },
    ];
    render(<ReasoningPanel toolCalls={toolCalls} streaming={false} />);

    const header = screen.getByRole("button", {
      name: /Reasoning · 2 steps/i,
    });

    fireEvent.click(header);
    expect(screen.getByText("Actions")).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("toggle has aria-expanded reflecting state", () => {
    const { container } = render(
      <ReasoningPanel plan="P" toolCalls={[]} streaming={false} />,
    );
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button as HTMLButtonElement);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});

describe("ToolCallRow", () => {
  it("renders an expandable code block when args parse to Python code", () => {
    // A multi-line snippet so the one-liner preview only shows the first
    // line — letting the test distinguish collapsed (preview only) from
    // expanded (full code visible) states.
    const code = "import os\nprint('hello world')";
    const call: ToolCall = {
      id: "x",
      name: "execute_python",
      args: JSON.stringify({ code }),
      done: true,
    };

    const { container } = render(<ToolCallRow n={1} call={call} />);

    // Collapsed: the second line of code is not yet in the DOM (only the
    // one-liner preview, which is the first non-comment line).
    expect(
      screen.queryByText("print('hello world')"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    // Expanded: the code body (mocked to a plain <pre>) contains the full
    // multi-line snippet.
    const pre = container.querySelector("pre");
    expect(pre?.textContent).toContain("import os");
    expect(pre?.textContent).toContain("print('hello world')");
  });

  it("toggle has aria-expanded reflecting state", () => {
    const call: ToolCall = {
      id: "x",
      name: "list_datasets",
      args: "",
      done: true,
      result: "ok",
    };
    const { container } = render(<ToolCallRow n={1} call={call} />);
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button as HTMLButtonElement);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
