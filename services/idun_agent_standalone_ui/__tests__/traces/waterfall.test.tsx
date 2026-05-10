import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Waterfall } from "@/components/traces/Waterfall";
import type { StandaloneSpanRead, StandaloneSpanTreeNode } from "@/lib/api/traces";

function makeSpan(overrides: Partial<StandaloneSpanRead>): StandaloneSpanRead {
  return {
    otelSpanId: "00000000",
    otelTraceId: "ffffffff",
    parentSpanId: null,
    name: "span",
    kind: "LLM",
    startedAt: "2026-05-09T12:00:00.000Z",
    endedAt: "2026-05-09T12:00:01.000Z",
    latencyMs: 1000,
    model: null,
    provider: null,
    promptTokens: null,
    completionTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    totalTokens: null,
    costUsd: null,
    costBreakdown: null,
    costSource: null,
    status: "OK",
    attributes: null,
    events: null,
    ...overrides,
  };
}

// Trace runs from t=0 to t=1000ms (total 1s).
//   root      [0, 1000]   1000ms — depth 0, longest at depth 0 (only one)
//   child-a   [100, 700]  600ms  — depth 1
//   child-b   [700, 900]  200ms  — depth 1 (so child-a is critical at depth 1)
const TREE: StandaloneSpanTreeNode[] = [
  {
    span: makeSpan({
      otelSpanId: "root",
      name: "root",
      kind: "AGENT",
      startedAt: "2026-05-09T12:00:00.000Z",
      endedAt: "2026-05-09T12:00:01.000Z",
    }),
    children: [
      {
        span: makeSpan({
          otelSpanId: "child-a",
          name: "child-a",
          kind: "LLM",
          startedAt: "2026-05-09T12:00:00.100Z",
          endedAt: "2026-05-09T12:00:00.700Z",
          latencyMs: 600,
          parentSpanId: "root",
        }),
        children: [],
      },
      {
        span: makeSpan({
          otelSpanId: "child-b",
          name: "child-b",
          kind: "TOOL",
          startedAt: "2026-05-09T12:00:00.700Z",
          endedAt: "2026-05-09T12:00:00.900Z",
          latencyMs: 200,
          parentSpanId: "root",
        }),
        children: [],
      },
    ],
  },
];

describe("Waterfall", () => {
  it("renders a list with one bar per span and the right name labels", () => {
    render(
      <Waterfall nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("list", { name: /span waterfall/i })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("root")).toBeInTheDocument();
    expect(screen.getByText("child-a")).toBeInTheDocument();
    expect(screen.getByText("child-b")).toBeInTheDocument();
  });

  it("computes percentage layout math correctly (margin-left + width as inline style)", () => {
    const { container } = render(
      <Waterfall nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />,
    );

    const bars = container.querySelectorAll('[data-slot="waterfall-bar"]');
    expect(bars).toHaveLength(3);

    // Trace runs 0..1000ms, so the math is straightforward.
    // Root: starts at 0, lasts 1000ms → margin 0%, width 100%.
    expect((bars[0] as HTMLElement).style.marginLeft).toBe("0%");
    expect((bars[0] as HTMLElement).style.width).toBe("100%");

    // child-a: starts at 100, lasts 600ms → margin 10%, width 60%.
    expect((bars[1] as HTMLElement).style.marginLeft).toBe("10%");
    expect((bars[1] as HTMLElement).style.width).toBe("60%");

    // child-b: starts at 700, lasts 200ms → margin 70%, width 20%.
    expect((bars[2] as HTMLElement).style.marginLeft).toBe("70%");
    expect((bars[2] as HTMLElement).style.width).toBe("20%");
  });

  it("marks the longest span at each depth as data-critical", () => {
    render(
      <Waterfall nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />,
    );
    const items = screen.getAllByRole("listitem");
    // Depth 0 has only root → critical.
    expect(items[0]).toHaveAttribute("data-critical", "true");
    // Depth 1: child-a (600ms) > child-b (200ms) → child-a is critical.
    expect(items[1]).toHaveAttribute("data-critical", "true");
    expect(items[2]).not.toHaveAttribute("data-critical");
  });

  it("calls onSelect when a row is clicked (selection model lifted to parent)", () => {
    const onSelect = vi.fn();
    render(
      <Waterfall nodes={TREE} selectedSpanId={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getAllByRole("listitem")[1]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ otelSpanId: "child-a" }),
    );
  });

  it("flags the selected row with data-selected", () => {
    render(
      <Waterfall
        nodes={TREE}
        selectedSpanId="child-b"
        onSelect={vi.fn()}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveAttribute("data-selected", "true");
    expect(items[0]).not.toHaveAttribute("data-selected");
  });

  it("renders the empty-state copy when given no spans", () => {
    render(<Waterfall nodes={[]} selectedSpanId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/no spans to plot/i)).toBeInTheDocument();
  });
});
