import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpanDetailRail } from "@/components/traces/SpanDetailRail";
import type { StandaloneSpanRead } from "@/lib/api/traces";

/**
 * Regression for AUDIT.md finding #4 — surface the OpenInference→ADK
 * instrumentation gap in the Info tab. When a span carries
 * ``gen_ai.usage.*`` or ``llm.token_count.*`` attribute keys but the
 * normalised ``promptTokens`` / ``completionTokens`` columns are
 * ``null``, the rail's Tokens / Cost rows render a "(why empty?)"
 * tooltip explaining the platform roadmap.
 *
 * Sharp edge: do NOT fire the tooltip on legitimately-zero spans (a
 * tool span that just doesn't make an LLM call). Detect via the
 * presence of any ``gen_ai.usage.*`` or ``llm.token_count.*`` attribute
 * key — both being absent means "no token-emitting call here".
 */

function makeSpan(
  overrides: Partial<StandaloneSpanRead> = {},
): StandaloneSpanRead {
  return {
    otelSpanId: "00000000",
    otelTraceId: "ffffffff",
    parentSpanId: null,
    name: "call_llm",
    kind: "LLM",
    startedAt: "2026-05-09T12:00:00.000Z",
    endedAt: "2026-05-09T12:00:01.000Z",
    latencyMs: 1234,
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

describe("SpanDetailRail null-tokens tooltip", () => {
  it("shows the why-empty tooltip when gen_ai.usage.* is present but tokens are null", () => {
    render(
      <SpanDetailRail
        span={makeSpan({
          attributes: {
            "gen_ai.usage.input_tokens": 17,
            "gen_ai.usage.output_tokens": 42,
            "gen_ai.request.model": "gemini-2.5-flash",
          },
        })}
      />,
    );
    const hints = screen.queryAllByTestId("tokens-empty-hint");
    expect(hints.length).toBeGreaterThan(0);
  });

  it("shows the why-empty tooltip when llm.token_count.* is present but tokens are null", () => {
    render(
      <SpanDetailRail
        span={makeSpan({
          attributes: {
            "llm.token_count.prompt": 17,
            "llm.token_count.completion": 42,
          },
        })}
      />,
    );
    expect(screen.queryAllByTestId("tokens-empty-hint").length).toBeGreaterThan(
      0,
    );
  });

  it("does NOT fire on a tool span with no LLM-call attributes (legitimate empty)", () => {
    render(
      <SpanDetailRail
        span={makeSpan({
          name: "execute_tool foo",
          kind: "TOOL",
          attributes: {
            "gcp.vertex.agent.tool_call_args": "{}",
            "gen_ai.tool.name": "foo",
          },
        })}
      />,
    );
    expect(screen.queryByTestId("tokens-empty-hint")).toBeNull();
  });

  it("does NOT fire when tokens are populated (instrumentation worked)", () => {
    render(
      <SpanDetailRail
        span={makeSpan({
          promptTokens: 17,
          completionTokens: 42,
          totalTokens: 59,
          attributes: {
            "gen_ai.usage.input_tokens": 17,
            "gen_ai.usage.output_tokens": 42,
          },
        })}
      />,
    );
    expect(screen.queryByTestId("tokens-empty-hint")).toBeNull();
  });

  it("does NOT fire when tokens are null AND no LLM attribute keys present", () => {
    render(<SpanDetailRail span={makeSpan({ attributes: null })} />);
    expect(screen.queryByTestId("tokens-empty-hint")).toBeNull();
  });
});
