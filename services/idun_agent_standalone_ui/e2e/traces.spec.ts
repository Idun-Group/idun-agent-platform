import { test, expect, type Route, type Page } from "@playwright/test";

/**
 * E2E for the trace UI flow (T5).
 *
 * Mock-driven: every `/admin/api/v1/traces*` call is intercepted via
 * `page.route()` so the test runs without a real backend (matches the
 * onboarding.spec.ts pattern). The boot-standalone harness still
 * supplies the static UI bundle, but no live agent is required.
 *
 * Two specs:
 *   1. List view — SqliteBanner + PipelineHealthPanel + trace rows.
 *   2. Detail view — navigates straight to the static-export
 *      placeholder route (`/admin/traces/__trace__/`) since Next.js
 *      `output: "export"` only emits an `index.html` for the
 *      enumerated `generateStaticParams()` paths. The runtime trace
 *      id is read off `useParams()` either way, so the placeholder
 *      shell exercises the same component graph users hit at runtime.
 *
 * The detail-from-list navigation (clicking a row in the list view to
 * land on the detail page) is intentionally **not** in this spec: the
 * static export does not emit a per-id directory, and the standalone
 * backend has no SPA-rewrite. Catching that wiring is a follow-up.
 */

const PLACEHOLDER_ID = "__trace__";

const MOCK_TRACES = [
  {
    otelTraceId: "0123456789abcdef0123456789abcdef",
    name: "agent.run",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
    latencyMs: 1234,
    totalTokens: 4096,
    totalCostUsd: 0.0123,
    models: ["gpt-4o"],
    status: "OK",
    userId: "geoffrey",
    sessionId: "sess-1",
    tags: ["prod"],
  },
  {
    otelTraceId: "fedcba9876543210fedcba9876543210",
    name: "tool.search",
    startedAt: "2026-05-09T11:55:00Z",
    endedAt: "2026-05-09T11:55:00.500Z",
    latencyMs: 500,
    totalTokens: 128,
    totalCostUsd: 0.001,
    models: [],
    status: "OK",
    userId: null,
    sessionId: null,
    tags: [],
  },
];

function makeSpan(overrides: Record<string, unknown>) {
  return {
    otelSpanId: "0000000000000000",
    otelTraceId: PLACEHOLDER_ID,
    parentSpanId: null,
    name: "root.span",
    kind: "AGENT",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
    latencyMs: 1000,
    model: null,
    provider: null,
    promptTokens: null,
    completionTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    totalTokens: 1024,
    costUsd: 0.01,
    costBreakdown: null,
    costSource: null,
    status: "OK",
    attributes: { "test.attribute": "hello", "test.count": 7 },
    events: null,
    ...overrides,
  };
}

const MOCK_DETAIL = {
  trace: {
    ...MOCK_TRACES[0],
    otelTraceId: PLACEHOLDER_ID,
  },
  tree: [
    {
      span: makeSpan({
        otelSpanId: "rootspan00000000",
        name: "root.span",
        kind: "AGENT",
      }),
      children: [
        {
          span: makeSpan({
            otelSpanId: "childllm00000000",
            name: "openai.chat",
            kind: "LLM",
            parentSpanId: "rootspan00000000",
            latencyMs: 800,
            attributes: {
              "llm.model_name": "gpt-4o",
              "input.value": '{"messages":[{"role":"user","content":"hi"}]}',
            },
          }),
          children: [],
        },
        {
          span: makeSpan({
            otelSpanId: "childtool0000000",
            name: "tool.search",
            kind: "TOOL",
            parentSpanId: "rootspan00000000",
            latencyMs: 50,
          }),
          children: [],
        },
      ],
    },
  ],
};

const MOCK_HEALTH = {
  queueDepth: 0,
  maxQueueSize: 8192,
  overflowCount: 0,
  writerRunning: true,
  databaseDialect: "sqlite" as const,
};

async function setupTraceMocks(page: Page) {
  // The auth probe used by the admin shell — short-circuit so the
  // trace pages don't bounce to /login in password mode.
  await page.route("**/admin/api/v1/agent", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "x",
          slug: null,
          name: "Mock Agent",
          description: null,
          version: null,
          status: "running",
          baseUrl: null,
          baseEngineConfig: { agent: { type: "LANGGRAPH" } },
          createdAt: "2026-05-09T00:00:00Z",
          updatedAt: "2026-05-09T00:00:00Z",
        },
      }),
    });
  });

  // Health endpoint — must register *before* the catch-all list route
  // so Playwright's last-registered-wins semantics route /_health to
  // the health response.
  await page.route(
    "**/admin/api/v1/traces/_health**",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_HEALTH),
      });
    },
  );

  // Detail endpoint — match any trace-id path under /traces/<id>.
  await page.route(
    "**/admin/api/v1/traces/*",
    async (route: Route) => {
      const url = new URL(route.request().url());
      // Skip the bare list (.../traces) and the health probe; both
      // get earlier-registered handlers above.
      if (
        url.pathname.endsWith("/traces") ||
        url.pathname.endsWith("/_health")
      ) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DETAIL),
      });
    },
  );

  // List endpoint — bare /traces and /traces?... .
  await page.route("**/admin/api/v1/traces*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.endsWith("/_health") ||
      /\/traces\/[^/?]+(?:[/?]|$)/.test(url.pathname + url.search)
    ) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: MOCK_TRACES,
        nextCursor: null,
        totalEstimate: MOCK_TRACES.length,
      }),
    });
  });
}

test("trace list — SqliteBanner + PipelineHealthPanel + rows", async ({
  page,
}) => {
  await setupTraceMocks(page);

  await page.goto("/admin/traces/");

  // SqliteBanner — locked-copy text.
  await expect(page.getByTestId("sqlite-banner")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(/SQLite mode — for local demo only\./),
  ).toBeVisible();

  // PipelineHealthPanel — Running writer + 0 drops.
  const healthPanel = page.getByTestId("pipeline-health-panel");
  await expect(healthPanel).toBeVisible();
  await expect(healthPanel.getByTestId("pipeline-writer")).toContainText(
    "Running",
  );

  // Two trace rows render.
  const rows = page.getByTestId("trace-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("agent.run");
});

test("trace detail — Tree, Waterfall, SpanDetailRail tabs", async ({
  page,
}) => {
  await setupTraceMocks(page);

  await page.goto(`/admin/traces/${PLACEHOLDER_ID}/`);

  // Header renders trace name.
  await expect(page.getByTestId("trace-detail-header")).toBeVisible({
    timeout: 15_000,
  });

  // Tree view shows 3 spans (root + 2 children).
  const treeitems = page.getByRole("treeitem");
  await expect(treeitems).toHaveCount(3);

  // Switch to the Waterfall tab.
  await page.getByRole("tab", { name: /waterfall/i }).click();

  // Waterfall renders each span as a keyboard-operable button. Scope
  // to the labelled "Span waterfall" container so we don't pick up
  // unrelated buttons elsewhere on the page.
  const waterfall = page.getByRole("group", { name: /span waterfall/i });
  await expect(
    waterfall.locator('[role="button"][data-span-id]'),
  ).toHaveCount(3);

  // Click the LLM child span in the waterfall.
  await waterfall
    .locator('[role="button"][data-span-id="childllm00000000"]')
    .click();

  // SpanDetailRail shows that span's name + Info tab is the default.
  const rail = page.getByTestId("span-detail-rail");
  await expect(rail).toContainText("openai.chat");

  // Switch to the Attributes tab; the JSON viewer renders one of the
  // LLM-span keys (the only attributes the openai.chat span carries).
  await rail.getByRole("tab", { name: /attributes/i }).click();
  await expect(rail).toContainText("llm.model_name");
});
