import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpanKindIcon } from "@/components/traces/SpanKindIcon";

const KINDS: Array<[string, string]> = [
  ["LLM", "LLM call"],
  ["EMBEDDING", "Embedding generation"],
  ["CHAIN", "Chain step"],
  ["RETRIEVER", "Retriever (vector / search)"],
  ["RERANKER", "Reranker (re-ordering retrieved docs)"],
  ["TOOL", "Tool / function call"],
  ["AGENT", "Agent decision step"],
  ["GUARDRAIL", "Guardrail check"],
  ["EVALUATOR", "Evaluator scoring"],
];

describe("SpanKindIcon", () => {
  it.each(KINDS)("renders kind %s with the matching aria-label", (kind, label) => {
    render(<SpanKindIcon kind={kind} />);
    expect(screen.getByRole("img", { name: label })).toBeInTheDocument();
  });

  it("falls back to the unknown-kind label for unrecognized kinds", () => {
    render(<SpanKindIcon kind="WAT" />);
    expect(
      screen.getByRole("img", { name: "Unknown span kind" }),
    ).toBeInTheDocument();
  });

  it("normalises case so lowercase kinds still resolve", () => {
    render(<SpanKindIcon kind="llm" />);
    expect(screen.getByRole("img", { name: "LLM call" })).toBeInTheDocument();
  });

  it("respects the optional size prop", () => {
    const { container } = render(<SpanKindIcon kind="LLM" size={24} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });
});
