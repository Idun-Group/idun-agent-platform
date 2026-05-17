/**
 * Span-kind inference for ADK-instrumented traces.
 *
 * Background — design KB §11 says "consume what the engine already
 * emits — OpenInference attributes from the LangChain OTel
 * instrumentor." That covers the LangChain path. Google ADK's native
 * instrumentation emits OTel ``SpanKind.INTERNAL`` and gen_ai semantic
 * conventions instead, so the entire trace UI renders as
 * ``CircleDashed`` / "Unknown span kind" on a working ADK agent.
 *
 * This module is the **UI-side stopgap** for AUDIT.md finding #3 —
 * map ADK span name patterns onto the OpenInference 9-kind enum so
 * icons, Waterfall colours, and per-kind chrome render correctly.
 * The proper fix is engine-side: ADK→OpenInference attribute
 * projection at emit time. See the deferred backlog ticket.
 *
 * Sharp edges:
 *
 * - **Explicit OpenInference kind ALWAYS wins.** If the span carries
 *   an ``openinference.span.kind`` attribute set to a real value (not
 *   ``INTERNAL``), or the ``kind`` column is one of the 9 OpenInference
 *   kinds, return that — never overwrite it with inferred output.
 * - **``INTERNAL`` is treated as missing.** OTel's default ``SpanKind``
 *   for unannotated spans is ``INTERNAL`` and ADK leaves it that way
 *   end-to-end. Treat it as a signal to fall through to name inference,
 *   not a real kind.
 * - **Returns ``undefined`` when nothing matches.** Consumers render
 *   the dashed-circle fallback so unknown shapes are visually surfaced
 *   rather than miscategorised.
 */

import type { StandaloneSpanRead } from "@/lib/api/traces";

/** The nine OpenInference span kinds. Locked by design KB §23. */
export const OPENINFERENCE_KINDS = [
  "LLM",
  "EMBEDDING",
  "CHAIN",
  "RETRIEVER",
  "RERANKER",
  "TOOL",
  "AGENT",
  "GUARDRAIL",
  "EVALUATOR",
] as const;

export type OpenInferenceKind = (typeof OPENINFERENCE_KINDS)[number];

const KIND_SET = new Set<string>(OPENINFERENCE_KINDS);

/**
 * Mapping from ADK span name prefix → inferred OpenInference kind.
 *
 * Order matters: the longer / more specific patterns come first so a
 * span named ``invoke_agent_tool`` (hypothetical) wouldn't be
 * misclassified as ``AGENT``. The current ADK shape only emits
 * ``invoke_agent``, ``execute_tool``, and ``call_llm``, so the table is
 * small and exhaustive.
 */
const NAME_PREFIX_RULES: ReadonlyArray<readonly [string, OpenInferenceKind]> = [
  ["invoke_agent", "AGENT"],
  ["execute_tool", "TOOL"],
  ["call_llm", "LLM"],
];

function isExplicitKind(value: string | null | undefined): value is OpenInferenceKind {
  if (!value) return false;
  return KIND_SET.has(value.toUpperCase());
}

function readAttributeKind(span: StandaloneSpanRead): OpenInferenceKind | undefined {
  const attrs = span.attributes;
  if (!attrs || typeof attrs !== "object") return undefined;
  const raw = (attrs as Record<string, unknown>)["openinference.span.kind"];
  if (typeof raw !== "string") return undefined;
  if (raw.toUpperCase() === "INTERNAL") return undefined;
  return isExplicitKind(raw) ? (raw.toUpperCase() as OpenInferenceKind) : undefined;
}

/**
 * Resolve the effective span kind for a span, with ADK fallback.
 *
 * Returns ``undefined`` when neither the explicit kind columns / attrs
 * nor the name pattern produces a known OpenInference kind. Consumers
 * then surface the dashed-circle "Unknown span kind" icon.
 */
export function inferKind(span: StandaloneSpanRead): OpenInferenceKind | undefined {
  // 1) explicit OpenInference kind on the attribute key wins.
  const fromAttrs = readAttributeKind(span);
  if (fromAttrs) return fromAttrs;

  // 2) explicit kind column when it's a real OpenInference kind (not
  //    ``INTERNAL`` and not some other engine-specific tag).
  const explicitKind = span.kind?.toUpperCase();
  if (explicitKind && explicitKind !== "INTERNAL" && KIND_SET.has(explicitKind)) {
    return explicitKind as OpenInferenceKind;
  }

  // 3) infer from span name prefix.
  const name = span.name ?? "";
  for (const [prefix, inferred] of NAME_PREFIX_RULES) {
    if (name.startsWith(prefix)) return inferred;
  }

  return undefined;
}
