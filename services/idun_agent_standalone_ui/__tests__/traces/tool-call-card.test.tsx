import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ToolCallCard,
  isToolShapedSpan,
} from "@/components/traces/ToolCallCard";
import type { StandaloneSpanRead } from "@/lib/api/traces";

/**
 * AUDIT.md finding #15 — TOOL spans (kind=TOOL OR name starting with
 * ``execute_tool``) must render structured Parameters / Result cards
 * that detect data across three attribute shapes:
 *
 *  1. OpenInference (LangChain-instrumented):
 *     ``tool.name`` / ``tool.parameters`` / ``tool.result``
 *  2. gen_ai semantic conventions (model-agnostic, OTel mainline):
 *     ``gen_ai.tool.name`` / ``gen_ai.tool.call.arguments`` /
 *     ``gen_ai.tool.result``
 *  3. Google ADK (Vertex flavour):
 *     ``gcp.vertex.agent.tool_call_args`` /
 *     ``gcp.vertex.agent.tool_response``
 *
 * The card must:
 * - Surface the tool name (from any of the three shapes).
 * - Show Parameters and Result as structured key/value rows when the
 *   payload is an object; fall back to a JSON viewer when it isn't.
 * - Render an empty-state when both panels lack data.
 *
 * The detection helper (``isToolShapedSpan``) drives the conditional
 * 6th tab in the rail — only TOOL-like spans get the Tool tab.
 */

function makeSpan(overrides: Partial<StandaloneSpanRead> = {}): StandaloneSpanRead {
  return {
    otelSpanId: "00000000",
    otelTraceId: "ffffffff",
    parentSpanId: null,
    name: "execute_tool showcase_menu",
    kind: "INTERNAL",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
    latencyMs: 100,
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

describe("isToolShapedSpan", () => {
  it("returns true when kind is TOOL", () => {
    expect(isToolShapedSpan(makeSpan({ kind: "TOOL", name: "anything" }))).toBe(
      true,
    );
  });
  it("returns true when name starts with execute_tool", () => {
    expect(
      isToolShapedSpan(makeSpan({ kind: "INTERNAL", name: "execute_tool foo" })),
    ).toBe(true);
  });
  it("returns true when openinference.span.kind attribute is TOOL", () => {
    expect(
      isToolShapedSpan(
        makeSpan({
          kind: "INTERNAL",
          name: "anything",
          attributes: { "openinference.span.kind": "TOOL" },
        }),
      ),
    ).toBe(true);
  });
  it("returns false on a generic LLM span", () => {
    expect(
      isToolShapedSpan(
        makeSpan({ kind: "LLM", name: "openai.chat", attributes: null }),
      ),
    ).toBe(false);
  });
});

describe("ToolCallCard", () => {
  it("renders OpenInference tool.parameters and tool.result key/value rows", () => {
    const span = makeSpan({
      kind: "TOOL",
      attributes: {
        "tool.name": "showcase_menu",
        "tool.description": "Returns the menu",
        "tool.parameters": JSON.stringify({ category: "drinks", count: 3 }),
        "tool.result": JSON.stringify({ items: ["espresso", "latte"] }),
      },
    });

    render(<ToolCallCard span={span} />);

    expect(screen.getByText("showcase_menu")).toBeInTheDocument();
    expect(screen.getByText("Returns the menu")).toBeInTheDocument();
    // Parameter rows
    expect(screen.getByText("category")).toBeInTheDocument();
    expect(screen.getByText('"drinks"')).toBeInTheDocument();
    expect(screen.getByText("count")).toBeInTheDocument();
    // Result rows
    expect(screen.getByText("items")).toBeInTheDocument();
  });

  it("renders gen_ai.tool.* shape (model-agnostic OTel semantic conventions)", () => {
    const span = makeSpan({
      attributes: {
        "gen_ai.tool.name": "weather_lookup",
        "gen_ai.tool.call.arguments": JSON.stringify({ city: "Paris" }),
        "gen_ai.tool.result": JSON.stringify({ tempC: 18 }),
      },
    });

    render(<ToolCallCard span={span} />);
    expect(screen.getByText("weather_lookup")).toBeInTheDocument();
    expect(screen.getByText("city")).toBeInTheDocument();
    expect(screen.getByText('"Paris"')).toBeInTheDocument();
    expect(screen.getByText("tempC")).toBeInTheDocument();
  });

  it("renders gcp.vertex.agent.* shape (Google ADK)", () => {
    const span = makeSpan({
      name: "execute_tool showcase_menu",
      attributes: {
        "gcp.vertex.agent.tool_call_args": JSON.stringify({
          query: "lunch specials",
        }),
        "gcp.vertex.agent.tool_response": JSON.stringify({
          status: "ok",
          payload: { entries: 5 },
        }),
      },
    });

    render(<ToolCallCard span={span} />);
    // ADK has no explicit tool.name attribute — fall back to parsing
    // the span name (everything after `execute_tool `).
    expect(screen.getByText("showcase_menu")).toBeInTheDocument();
    expect(screen.getByText("query")).toBeInTheDocument();
    expect(screen.getByText('"lunch specials"')).toBeInTheDocument();
    expect(screen.getByText("status")).toBeInTheDocument();
    expect(screen.getByText('"ok"')).toBeInTheDocument();
  });

  it("renders the empty-state when both panels lack data", () => {
    const span = makeSpan({ kind: "TOOL", attributes: { "tool.name": "x" } });
    render(<ToolCallCard span={span} />);
    expect(
      screen.getByText(/no parameters or result recorded/i),
    ).toBeInTheDocument();
  });

  it("falls back to a JSON viewer for non-object Parameters payload (string)", () => {
    const span = makeSpan({
      kind: "TOOL",
      attributes: {
        "tool.name": "echo",
        "tool.parameters": "just-a-string",
        "tool.result": JSON.stringify({ ok: true }),
      },
    });

    render(<ToolCallCard span={span} />);
    // String parameter rendered inline (not parsed into rows). The
    // test asserts the content is on the page; the exact wrapper
    // (a <pre>) is verified by the structure but not the text match.
    expect(screen.getByText("just-a-string")).toBeInTheDocument();
  });
});
