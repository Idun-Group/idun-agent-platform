import { describe, expect, it } from "vitest";

import { inferKind } from "@/components/traces/_kind";
import type { StandaloneSpanRead } from "@/lib/api/traces";

/**
 * Unit tests for ``inferKind`` — the ADK fallback that maps span name
 * patterns onto the OpenInference 9-kind enum when explicit kind data
 * is missing or ``INTERNAL`` and no ``openinference.span.kind``
 * attribute is set.
 *
 * Sharp edges from AUDIT.md #3:
 * - Explicit OpenInference kind via ``openinference.span.kind`` ALWAYS
 *   wins (the helper exists for ADK traces, not LangChain).
 * - ``kind="INTERNAL"`` falls back to inference because Google ADK's
 *   native instrumentation emits OTel ``SpanKind.INTERNAL``.
 * - ``inferKind`` returns ``undefined`` when nothing maps; consumers
 *   handle ``undefined`` as the dashed-circle fallback.
 */

function makeSpan(
  overrides: Partial<StandaloneSpanRead> & { name: string },
): StandaloneSpanRead {
  return {
    otelSpanId: "0000000000000000",
    otelTraceId: "00000000",
    parentSpanId: null,
    kind: "INTERNAL",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
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

describe("inferKind", () => {
  it("infers AGENT from invoke_agent name prefix", () => {
    expect(
      inferKind(makeSpan({ name: "invoke_agent showcase_coordinator" })),
    ).toBe("AGENT");
  });

  it("infers TOOL from execute_tool name prefix", () => {
    expect(inferKind(makeSpan({ name: "execute_tool showcase_menu" }))).toBe(
      "TOOL",
    );
  });

  it("infers LLM from call_llm name prefix", () => {
    expect(inferKind(makeSpan({ name: "call_llm" }))).toBe("LLM");
  });

  it("infers LLM from call_llm with detail suffix", () => {
    expect(inferKind(makeSpan({ name: "call_llm gpt-4o" }))).toBe("LLM");
  });

  it("returns undefined when no pattern matches", () => {
    expect(inferKind(makeSpan({ name: "anything" }))).toBeUndefined();
  });

  it("respects an explicit OpenInference kind even when the name pattern would otherwise infer", () => {
    // Even though the name says ``invoke_agent``, the explicit
    // ``openinference.span.kind`` of RETRIEVER must win — explicit
    // kinds are first-class.
    const span = makeSpan({
      name: "invoke_agent foo",
      kind: "INTERNAL",
      attributes: { "openinference.span.kind": "RETRIEVER" },
    });
    expect(inferKind(span)).toBe("RETRIEVER");
  });

  it("respects an explicit kind on the kind column", () => {
    const span = makeSpan({ name: "anything", kind: "RERANKER" });
    expect(inferKind(span)).toBe("RERANKER");
  });

  it("treats kind=INTERNAL as missing and falls through to name inference", () => {
    const span = makeSpan({
      name: "execute_tool foo",
      kind: "INTERNAL",
    });
    expect(inferKind(span)).toBe("TOOL");
  });

  it("treats explicit openinference.span.kind=INTERNAL as missing too", () => {
    // Per the audit: INTERNAL is the OTel default and should fall
    // through to name inference rather than masking the real shape.
    const span = makeSpan({
      name: "execute_tool foo",
      kind: "INTERNAL",
      attributes: { "openinference.span.kind": "INTERNAL" },
    });
    expect(inferKind(span)).toBe("TOOL");
  });

  it("normalises explicit kind to upper-case", () => {
    const span = makeSpan({ name: "x", kind: "llm" });
    expect(inferKind(span)).toBe("LLM");
  });

  it("returns undefined for an empty name with no explicit kind", () => {
    expect(inferKind(makeSpan({ name: "", kind: "INTERNAL" }))).toBeUndefined();
  });
});
