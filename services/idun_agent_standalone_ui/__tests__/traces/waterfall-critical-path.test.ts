import { describe, expect, it } from "vitest";

import {
  __computeCriticalPathIds,
  __flattenForWaterfall,
} from "@/components/traces/Waterfall";
import type { StandaloneSpanRead, StandaloneSpanTreeNode } from "@/lib/api/traces";

/**
 * AUDIT.md finding #16 — critical-path emphasis must follow a root-to-leaf
 * longest-child chain, NOT "longest at each depth". This regression case is
 * the canonical counter-example: at depth 1 the LONGER sibling has a
 * SHORTER child than the SHORTER sibling. The fixed implementation must
 * walk top-down from root, picking the longest child at each step, so the
 * critical path is `root → wide-1 → wide-1.short` (the wide branch wins
 * because it's strictly longer than narrow at depth 1, even though the
 * single deepest grandchild lives under narrow).
 *
 * The OLD implementation grouped by depth and picked the longest span per
 * depth — it would mark `narrow.long-grandchild` as critical because it's
 * the only thing at depth 2; that span is in a different subtree from the
 * depth-1 winner, so the rendered "critical path" is conceptually broken.
 */

function makeSpan(
  overrides: Partial<StandaloneSpanRead>,
): StandaloneSpanRead {
  return {
    otelSpanId: "00000000",
    otelTraceId: "ffffffff",
    parentSpanId: null,
    name: "span",
    kind: "INTERNAL",
    startedAt: "2026-05-09T12:00:00.000Z",
    endedAt: "2026-05-09T12:00:00.100Z",
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

/**
 *      root            [0, 1000ms]    1000ms
 *       ├── wide-1     [0,  800ms]     800ms   ← longest depth-1 sibling
 *       │     └── wide-1.short [10, 30ms]  20ms
 *       └── narrow     [800, 900ms]   100ms
 *             └── narrow.long-grandchild [810, 890ms]   80ms
 *
 *  - Old depth-by-depth impl picks: root, wide-1 (depth 1 longest),
 *    narrow.long-grandchild (depth 2 longest — but in narrow's subtree!).
 *    That's not a connected path → bug.
 *  - Correct impl walks: root → longest child = wide-1 → longest child
 *    of wide-1 = wide-1.short. Critical path = {root, wide-1, wide-1.short}.
 */
const TREE: StandaloneSpanTreeNode[] = [
  {
    span: makeSpan({
      otelSpanId: "root",
      name: "root",
      startedAt: "2026-05-09T12:00:00.000Z",
      endedAt: "2026-05-09T12:00:01.000Z",
      latencyMs: 1000,
    }),
    children: [
      {
        span: makeSpan({
          otelSpanId: "wide-1",
          name: "wide-1",
          parentSpanId: "root",
          startedAt: "2026-05-09T12:00:00.000Z",
          endedAt: "2026-05-09T12:00:00.800Z",
          latencyMs: 800,
        }),
        children: [
          {
            span: makeSpan({
              otelSpanId: "wide-1.short",
              name: "wide-1.short",
              parentSpanId: "wide-1",
              startedAt: "2026-05-09T12:00:00.010Z",
              endedAt: "2026-05-09T12:00:00.030Z",
              latencyMs: 20,
            }),
            children: [],
          },
        ],
      },
      {
        span: makeSpan({
          otelSpanId: "narrow",
          name: "narrow",
          parentSpanId: "root",
          startedAt: "2026-05-09T12:00:00.800Z",
          endedAt: "2026-05-09T12:00:00.900Z",
          latencyMs: 100,
        }),
        children: [
          {
            span: makeSpan({
              otelSpanId: "narrow.long-grandchild",
              name: "narrow.long-grandchild",
              parentSpanId: "narrow",
              startedAt: "2026-05-09T12:00:00.810Z",
              endedAt: "2026-05-09T12:00:00.890Z",
              latencyMs: 80,
            }),
            children: [],
          },
        ],
      },
    ],
  },
];

describe("criticalPathIds — top-down longest-child chain", () => {
  it("walks root → longest child → recurse — does NOT pick the depth-2 max from a different subtree", () => {
    const flat = __flattenForWaterfall(TREE);
    const critical = __computeCriticalPathIds(TREE, flat);

    // Connected chain through the longest-duration subtree:
    expect(critical.has("root")).toBe(true);
    expect(critical.has("wide-1")).toBe(true);
    expect(critical.has("wide-1.short")).toBe(true);

    // The wrong-impl tell: narrow.long-grandchild (80ms, in the narrow
    // subtree) must NOT be on the critical path even though it's longer
    // than wide-1.short (20ms) — they're in different subtrees and the
    // top-down walker chose wide-1 at depth 1.
    expect(critical.has("narrow.long-grandchild")).toBe(false);
    expect(critical.has("narrow")).toBe(false);
  });

  it("handles a single-root single-leaf chain (degenerate case)", () => {
    const SIMPLE: StandaloneSpanTreeNode[] = [
      {
        span: makeSpan({ otelSpanId: "only" }),
        children: [],
      },
    ];
    const flat = __flattenForWaterfall(SIMPLE);
    const critical = __computeCriticalPathIds(SIMPLE, flat);
    expect(critical).toEqual(new Set(["only"]));
  });

  it("walks from each root when multiple roots exist", () => {
    // Each span carries explicit started/ended timestamps because
    // ``__flattenForWaterfall`` derives durationMs from those, not from
    // the optional ``latencyMs`` column.
    const FOREST: StandaloneSpanTreeNode[] = [
      {
        span: makeSpan({
          otelSpanId: "r1",
          startedAt: "2026-05-09T12:00:00.000Z",
          endedAt: "2026-05-09T12:00:00.500Z",
          latencyMs: 500,
        }),
        children: [
          {
            span: makeSpan({
              otelSpanId: "r1-c1",
              parentSpanId: "r1",
              startedAt: "2026-05-09T12:00:00.000Z",
              endedAt: "2026-05-09T12:00:00.100Z",
              latencyMs: 100,
            }),
            children: [],
          },
          {
            span: makeSpan({
              otelSpanId: "r1-c2",
              parentSpanId: "r1",
              startedAt: "2026-05-09T12:00:00.100Z",
              endedAt: "2026-05-09T12:00:00.400Z",
              latencyMs: 300,
            }),
            children: [],
          },
        ],
      },
      {
        span: makeSpan({
          otelSpanId: "r2",
          startedAt: "2026-05-09T12:00:01.000Z",
          endedAt: "2026-05-09T12:00:01.200Z",
          latencyMs: 200,
        }),
        children: [],
      },
    ];
    const flat = __flattenForWaterfall(FOREST);
    const critical = __computeCriticalPathIds(FOREST, flat);
    expect(critical.has("r1")).toBe(true);
    expect(critical.has("r1-c2")).toBe(true);
    expect(critical.has("r1-c1")).toBe(false);
    expect(critical.has("r2")).toBe(true);
  });
});
