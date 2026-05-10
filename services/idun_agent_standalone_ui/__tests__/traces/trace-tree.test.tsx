import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TraceTree } from "@/components/traces/TraceTree";
import type { StandaloneSpanRead, StandaloneSpanTreeNode } from "@/lib/api/traces";

function makeSpan(overrides: Partial<StandaloneSpanRead>): StandaloneSpanRead {
  return {
    otelSpanId: "00000000",
    otelTraceId: "ffffffff",
    parentSpanId: null,
    name: "span",
    kind: "LLM",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
    latencyMs: 100,
    model: null,
    provider: null,
    promptTokens: null,
    completionTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    totalTokens: 50,
    costUsd: 0.001,
    costBreakdown: null,
    costSource: null,
    status: "OK",
    attributes: null,
    events: null,
    ...overrides,
  };
}

// Three levels: root → child → grandchild.
const TREE: StandaloneSpanTreeNode[] = [
  {
    span: makeSpan({ otelSpanId: "root", name: "root", kind: "AGENT" }),
    children: [
      {
        span: makeSpan({
          otelSpanId: "child",
          name: "child",
          kind: "LLM",
          parentSpanId: "root",
          totalTokens: 200,
          costUsd: 0.0123,
          costBreakdown: { partial: true },
        }),
        children: [
          {
            span: makeSpan({
              otelSpanId: "grandchild",
              name: "grandchild",
              kind: "TOOL",
              parentSpanId: "child",
              latencyMs: 25,
            }),
            children: [],
          },
        ],
      },
    ],
  },
];

describe("TraceTree", () => {
  it("renders the W3C ARIA tree pattern (tree + treeitem + aria-level)", () => {
    render(<TraceTree nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("tree", { name: /span tree/i })).toBeInTheDocument();
    const items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(3);

    // Root, child, grandchild are at levels 1, 2, 3.
    expect(items[0]).toHaveAttribute("aria-level", "1");
    expect(items[1]).toHaveAttribute("aria-level", "2");
    expect(items[2]).toHaveAttribute("aria-level", "3");

    // Parents have aria-expanded=true (default-expanded).
    expect(items[0]).toHaveAttribute("aria-expanded", "true");
    expect(items[1]).toHaveAttribute("aria-expanded", "true");
    // Leaf has no aria-expanded.
    expect(items[2]).not.toHaveAttribute("aria-expanded");

    // posinset / setsize on root.
    expect(items[0]).toHaveAttribute("aria-posinset", "1");
    expect(items[0]).toHaveAttribute("aria-setsize", "1");
  });

  it("renders the latency, tokens, and cost badges per row (with ~ for partial cost)", () => {
    render(<TraceTree nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />);

    // Tokens cell: root has 50, child has 200.
    expect(screen.getAllByText("50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("200")).toBeInTheDocument();

    // Child's cost is partial — must render with the ~ prefix.
    expect(screen.getByText("~$0.0123")).toBeInTheDocument();

    // Grandchild has a unique latency.
    expect(screen.getByText("25 ms")).toBeInTheDocument();
  });

  it("supports ArrowDown / ArrowUp keyboard navigation", () => {
    const onSelect = vi.fn();
    render(
      <TraceTree nodes={TREE} selectedSpanId={null} onSelect={onSelect} />,
    );

    const tree = screen.getByRole("tree");
    const items = screen.getAllByRole("treeitem");

    // Initial: root is the focusable row.
    expect(items[0]).toHaveAttribute("tabindex", "0");
    expect(items[1]).toHaveAttribute("tabindex", "-1");

    // ArrowDown moves focus to the child row.
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(items[1]).toHaveAttribute("tabindex", "0");
    expect(items[0]).toHaveAttribute("tabindex", "-1");

    // ArrowDown again → grandchild.
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(items[2]).toHaveAttribute("tabindex", "0");

    // ArrowUp → back to child.
    fireEvent.keyDown(tree, { key: "ArrowUp" });
    expect(items[1]).toHaveAttribute("tabindex", "0");

    // Home → root.
    fireEvent.keyDown(tree, { key: "End" });
    expect(items[2]).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(tree, { key: "Home" });
    expect(items[0]).toHaveAttribute("tabindex", "0");
  });

  it("collapses on ArrowLeft when expanded; navigates to parent when already collapsed", () => {
    render(<TraceTree nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />);

    const tree = screen.getByRole("tree");

    // Move focus to child.
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    let items = screen.getAllByRole("treeitem");
    expect(items[1]).toHaveAttribute("tabindex", "0");
    expect(items[1]).toHaveAttribute("aria-expanded", "true");

    // ArrowLeft on an expanded parent collapses it.
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    items = screen.getAllByRole("treeitem");
    // After collapsing the child, only root + child remain in the tree.
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveAttribute("aria-expanded", "false");

    // ArrowLeft on the now-collapsed child moves focus to root.
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    items = screen.getAllByRole("treeitem");
    expect(items[0]).toHaveAttribute("tabindex", "0");
  });

  it("expands on ArrowRight; subsequent ArrowRight focuses the first child", () => {
    // Start with root collapsed so ArrowRight has work to do.
    const collapsed = new Set<string>(); // nothing expanded
    render(
      <TraceTree
        nodes={TREE}
        selectedSpanId={null}
        onSelect={vi.fn()}
        initialExpanded={collapsed}
      />,
    );

    const tree = screen.getByRole("tree");
    let items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute("aria-expanded", "false");

    // ArrowRight on collapsed root → expand.
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("aria-expanded", "true");

    // ArrowRight again → focus first child.
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    items = screen.getAllByRole("treeitem");
    expect(items[1]).toHaveAttribute("tabindex", "0");
  });

  it("calls onSelect with the span when Enter is pressed", () => {
    const onSelect = vi.fn();
    render(
      <TraceTree nodes={TREE} selectedSpanId={null} onSelect={onSelect} />,
    );

    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ otelSpanId: "root" });
  });

  it("calls onSelect when a row is clicked (selection model is lifted)", () => {
    const onSelect = vi.fn();
    render(
      <TraceTree nodes={TREE} selectedSpanId={null} onSelect={onSelect} />,
    );
    const items = screen.getAllByRole("treeitem");
    fireEvent.click(items[2]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ otelSpanId: "grandchild" }),
    );
  });

  it("expands ancestors when selectedSpanId changes externally", () => {
    // Start fully collapsed so the grandchild is hidden under root + child.
    const empty = new Set<string>();
    const { rerender } = render(
      <TraceTree
        nodes={TREE}
        selectedSpanId={null}
        onSelect={vi.fn()}
        initialExpanded={empty}
      />,
    );

    // Only the root row is visible at this point.
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);

    // External selection (e.g. user clicked the grandchild bar in the
    // Waterfall) -- the tree must expand the ancestor chain so the
    // selected row becomes visible.
    rerender(
      <TraceTree
        nodes={TREE}
        selectedSpanId="grandchild"
        onSelect={vi.fn()}
        initialExpanded={empty}
      />,
    );

    const items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(3);
    // Focus moves to the externally-selected row.
    expect(items[2]).toHaveAttribute("tabindex", "0");
    expect(items[2]).toHaveAttribute("aria-selected", "true");
  });

  it("marks the selected row with aria-selected=true", () => {
    render(
      <TraceTree
        nodes={TREE}
        selectedSpanId="child"
        onSelect={vi.fn()}
      />,
    );
    const items = screen.getAllByRole("treeitem");
    expect(items[0]).toHaveAttribute("aria-selected", "false");
    expect(items[1]).toHaveAttribute("aria-selected", "true");
    expect(items[2]).toHaveAttribute("aria-selected", "false");
  });

  // ── P3 Sub-C coverage: expand-all / collapse-all / errors-only ───────

  it("Collapse all leaves only the root row visible", () => {
    render(<TraceTree nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(3);

    fireEvent.click(screen.getByTestId("tree-toolbar-collapse-all"));

    const items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute("aria-expanded", "false");
  });

  it("Expand all re-expands the entire tree after a collapse", () => {
    const empty = new Set<string>();
    render(
      <TraceTree
        nodes={TREE}
        selectedSpanId={null}
        onSelect={vi.fn()}
        initialExpanded={empty}
      />,
    );
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("tree-toolbar-expand-all"));

    expect(screen.getAllByRole("treeitem")).toHaveLength(3);
  });

  it("Errors only is disabled when no spans have status=ERROR", () => {
    render(<TraceTree nodes={TREE} selectedSpanId={null} onSelect={vi.fn()} />);
    const btn = screen.getByTestId("tree-toolbar-errors-only");
    expect(btn).toBeDisabled();
  });

  it("Errors only expands ancestor chains of error spans and collapses the rest", () => {
    // Tag the grandchild with status=ERROR so the toolbar action has
    // a target. The error-path set should be { root, child, grandchild }.
    const ERR_TREE: StandaloneSpanTreeNode[] = [
      {
        ...TREE[0],
        children: [
          {
            ...TREE[0].children[0],
            children: [
              {
                span: makeSpan({
                  otelSpanId: "grandchild",
                  name: "grandchild",
                  parentSpanId: "child",
                  status: "ERROR",
                }),
                children: [],
              },
            ],
          },
          {
            span: makeSpan({
              otelSpanId: "second-child",
              name: "second-child",
              parentSpanId: "root",
              status: "OK",
            }),
            children: [
              {
                span: makeSpan({
                  otelSpanId: "second-grandchild",
                  name: "second-grandchild",
                  parentSpanId: "second-child",
                  status: "OK",
                }),
                children: [],
              },
            ],
          },
        ],
      },
    ];

    render(
      <TraceTree
        nodes={ERR_TREE}
        selectedSpanId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("treeitem")).toHaveLength(5);

    fireEvent.click(screen.getByTestId("tree-toolbar-errors-only"));

    // Only the error path stays expanded: root + child + grandchild.
    // second-child is collapsed (its branch has no errors).
    const items = screen.getAllByRole("treeitem");
    const visibleIds = items.map((i) => i.getAttribute("data-span-id"));
    expect(visibleIds).toContain("root");
    expect(visibleIds).toContain("child");
    expect(visibleIds).toContain("grandchild");
    expect(visibleIds).toContain("second-child");
    // second-grandchild is collapsed under second-child.
    expect(visibleIds).not.toContain("second-grandchild");
  });
});
