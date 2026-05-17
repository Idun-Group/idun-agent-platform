import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Regression test for the trailing-slash variant of the trace detail
 * SPA-rewrite route. The slashed form (``/admin/traces/<id>/``) must
 * resolve to the same SPA shell as the no-slash form — browser address
 * bars, link-share apps, and Slack unfurls all routinely append a
 * trailing slash, so a 404 on this path is operator-hostile.
 *
 * Mock-driven: we don't need a real trace to land in the DB, only to
 * confirm the dynamic route registration covers both URL forms. The
 * trace-detail and health endpoints are mocked the same way as in
 * ``traces.spec.ts``.
 */

const PLACEHOLDER_ID = "abcdef0123456789abcdef0123456789";

const MOCK_HEALTH = {
  queueDepth: 0,
  maxQueueSize: 8192,
  overflowCount: 0,
  writerRunning: true,
  databaseDialect: "sqlite" as const,
};

function makeSpan() {
  return {
    otelSpanId: "0000000000000000",
    otelTraceId: PLACEHOLDER_ID.slice(16),
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
    attributes: {},
    events: null,
  };
}

const MOCK_DETAIL = {
  trace: {
    otelTraceId: PLACEHOLDER_ID,
    name: "agent.run",
    startedAt: "2026-05-09T12:00:00Z",
    endedAt: "2026-05-09T12:00:01Z",
    latencyMs: 1234,
    totalTokens: 4096,
    totalCostUsd: 0.0123,
    models: ["gpt-4o"],
    status: "OK",
    userId: null,
    sessionId: null,
    tags: [],
  },
  tree: [{ span: makeSpan(), children: [] }],
};

async function setupMocks(page: Page) {
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

  await page.route("**/admin/api/v1/traces/*", async (route: Route) => {
    const url = new URL(route.request().url());
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
  });
}

test("admin trace detail — trailing-slash form resolves the SPA shell", async ({
  page,
}) => {
  await setupMocks(page);

  // The bug: the slashed form was 404'ing because StaticFiles consumed
  // the URL before the dynamic route saw it. The fix adds a sibling
  // route declaration; this assertion drives the fix.
  const response = await page.goto(`/admin/traces/${PLACEHOLDER_ID}/`);
  expect(response?.status()).toBe(200);

  // The detail header is the SPA shell signal — if the placeholder
  // shell were served instead, the header wouldn't render.
  await expect(page.getByTestId("trace-detail-header")).toBeVisible({
    timeout: 15_000,
  });
});

test("admin trace detail — no-slash form still resolves the SPA shell", async ({
  page,
}) => {
  await setupMocks(page);

  const response = await page.goto(`/admin/traces/${PLACEHOLDER_ID}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("trace-detail-header")).toBeVisible({
    timeout: 15_000,
  });
});
