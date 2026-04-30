import { test, expect, type Route, type Page } from "@playwright/test";

/**
 * E2E tests for the onboarding wizard.
 *
 * The repo's existing `e2e/boot-standalone.sh` always seeds an agent, so
 * `GET /admin/api/v1/agent` would normally short-circuit the chat root
 * away from `/onboarding`. We use `page.route()` to override the agent +
 * onboarding endpoints per-test so the wizard can be exercised in
 * scenarios the live backend can't easily reproduce (reload-failure,
 * MANY_DETECTED, ALREADY_CONFIGURED with a pre-seeded current agent, …).
 *
 * Each test routes the relevant URLs and then navigates the wizard
 * through the browser. The mocks live entirely on the client side — the
 * real backend is never reached for these calls.
 */

interface MockState {
  scan: () => unknown;
  agent?: () => unknown;
  createStarter?: () => { status: number; body: unknown };
  createFromDetection?: () => { status: number; body: unknown };
  login?: () => { status: number; body: unknown };
  graph?: () => { status: number; body: unknown };
}

async function setupMocks(page: Page, state: MockState) {
  // GET /admin/api/v1/agent — controls whether the chat root redirects.
  await page.route("**/admin/api/v1/agent", async (route: Route) => {
    if (state.agent) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.agent()),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "not_found" } }),
      });
    }
  });

  await page.route(
    "**/admin/api/v1/onboarding/scan",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.scan()),
      });
    },
  );

  if (state.createStarter) {
    await page.route(
      "**/admin/api/v1/onboarding/create-starter",
      async (route: Route) => {
        const r = state.createStarter!();
        await route.fulfill({
          status: r.status,
          contentType: "application/json",
          body: JSON.stringify(r.body),
        });
      },
    );
  }

  if (state.createFromDetection) {
    await page.route(
      "**/admin/api/v1/onboarding/create-from-detection",
      async (route: Route) => {
        const r = state.createFromDetection!();
        await route.fulfill({
          status: r.status,
          contentType: "application/json",
          body: JSON.stringify(r.body),
        });
      },
    );
  }

  if (state.login) {
    await page.route("**/admin/api/v1/auth/login", async (route: Route) => {
      const r = state.login!();
      await route.fulfill({
        status: r.status,
        contentType: "application/json",
        body: JSON.stringify(r.body),
      });
    });
  }

  if (state.graph) {
    await page.route("**/agent/graph", async (route: Route) => {
      const r = state.graph!();
      await route.fulfill({
        status: r.status,
        contentType: "application/json",
        body: JSON.stringify(r.body),
      });
    });
  }
}

const EMPTY_SCAN = {
  state: "EMPTY",
  scanResult: {
    root: "/tmp",
    detected: [],
    hasPythonFiles: false,
    hasIdunConfig: false,
    scanDurationMs: 1,
  },
  currentAgent: null,
};

const ONE_LANGGRAPH_DETECTION = {
  framework: "LANGGRAPH" as const,
  filePath: "agent.py",
  variableName: "graph",
  inferredName: "My Agent",
  confidence: "HIGH" as const,
  source: "source" as const,
};

const ONE_DETECTED_SCAN = {
  state: "ONE_DETECTED",
  scanResult: {
    root: "/tmp",
    detected: [ONE_LANGGRAPH_DETECTION],
    hasPythonFiles: true,
    hasIdunConfig: false,
    scanDurationMs: 1,
  },
  currentAgent: null,
};

const STARTER_AGENT_RESPONSE = {
  data: {
    id: "x",
    slug: null,
    name: "Starter Agent",
    description: null,
    version: null,
    status: "draft",
    baseUrl: null,
    baseEngineConfig: { agent: { type: "LANGGRAPH" } },
    createdAt: "2026-04-29T00:00:00Z",
    updatedAt: "2026-04-29T00:00:00Z",
  },
  reload: { status: "reloaded", message: "Reloaded." },
};

const GRAPH_RESPONSE = {
  format_version: "1",
  metadata: {
    framework: "LANGGRAPH",
    agent_name: "Starter Agent",
    root_id: "agent:root",
    warnings: [],
  },
  nodes: [
    {
      kind: "agent",
      id: "agent:root",
      name: "Starter Agent",
      agent_kind: "llm",
      is_root: true,
      description: null,
      model: null,
      loop_max_iterations: null,
    },
  ],
  edges: [],
};

test("EMPTY → user picks LangGraph → confirms → done shows OPENAI_API_KEY", async ({
  page,
}) => {
  await setupMocks(page, {
    scan: () => EMPTY_SCAN,
    createStarter: () => ({ status: 200, body: STARTER_AGENT_RESPONSE }),
    graph: () => ({ status: 200, body: GRAPH_RESPONSE }),
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/let's create your first idun agent/i)).toBeVisible();
  await page.getByLabel(/langgraph/i).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText(/confirm your starter/i)).toBeVisible();
  await page.getByRole("button", { name: /create starter/i }).click();
  await expect(page.getByText(/Starter Agent is ready/i)).toBeVisible();
  await expect(page.getByText("OPENAI_API_KEY")).toBeVisible();
  // Graph card visible with at least one agent node rendered by ReactFlow
  await expect(page.getByText("Your agent", { exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 10_000,
  });
});

test("ONE_DETECTED → user clicks Use → done shows generic env reminder", async ({
  page,
}) => {
  await setupMocks(page, {
    scan: () => ONE_DETECTED_SCAN,
    createFromDetection: () => ({
      status: 200,
      body: {
        ...STARTER_AGENT_RESPONSE,
        data: { ...STARTER_AGENT_RESPONSE.data, name: "My Agent" },
      },
    }),
    graph: () => ({ status: 200, body: GRAPH_RESPONSE }),
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/found your agent/i)).toBeVisible();
  await page.getByRole("button", { name: /use this agent/i }).click();
  await expect(page.getByText(/My Agent is ready/i)).toBeVisible();
  await expect(
    page.getByText(/make sure your agent's environment variables are set/i),
  ).toBeVisible();
  // Graph card visible with at least one agent node rendered by ReactFlow
  await expect(page.getByText("Your agent", { exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 10_000,
  });
});

test("MANY_DETECTED → user picks the second → confirms → done", async ({
  page,
}) => {
  const SECOND = {
    framework: "ADK" as const,
    filePath: "main_adk.py",
    variableName: "agent",
    inferredName: "B Agent",
    confidence: "HIGH" as const,
    source: "source" as const,
  };
  await setupMocks(page, {
    scan: () => ({
      ...ONE_DETECTED_SCAN,
      state: "MANY_DETECTED",
      scanResult: {
        ...ONE_DETECTED_SCAN.scanResult,
        detected: [ONE_LANGGRAPH_DETECTION, SECOND],
      },
    }),
    createFromDetection: () => ({
      status: 200,
      body: {
        ...STARTER_AGENT_RESPONSE,
        data: { ...STARTER_AGENT_RESPONSE.data, name: "B Agent" },
      },
    }),
    graph: () => ({ status: 200, body: GRAPH_RESPONSE }),
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/pick your agent/i)).toBeVisible();
  await page.getByLabel(/B Agent/).click();
  await page.getByRole("button", { name: /use selected/i }).click();
  await expect(page.getByText(/B Agent is ready/i)).toBeVisible();
  // Graph card visible with at least one agent node rendered by ReactFlow
  await expect(page.getByText("Your agent", { exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 10_000,
  });
});

test("ALREADY_CONFIGURED → wizard auto-redirects to /", async ({ page }) => {
  await setupMocks(page, {
    scan: () => ({
      ...EMPTY_SCAN,
      state: "ALREADY_CONFIGURED",
      currentAgent: STARTER_AGENT_RESPONSE.data,
    }),
    agent: () => STARTER_AGENT_RESPONSE.data,
  });
  await page.goto("/onboarding");
  // After wizard sees ALREADY_CONFIGURED, it replaces the route with /.
  await page.waitForURL(/\/(?:\?.*)?$/, { timeout: 15_000 });
});

test("Reload failure → error screen shows diagnostic + Retry → second attempt 200 → done", async ({
  page,
}) => {
  let attempts = 0;
  await setupMocks(page, {
    scan: () => EMPTY_SCAN,
    createStarter: () => {
      attempts++;
      if (attempts === 1) {
        return {
          status: 500,
          body: {
            error: {
              code: "reload_failed",
              message: "Engine init failed: bad import in agent.py.",
            },
          },
        };
      }
      return { status: 200, body: STARTER_AGENT_RESPONSE };
    },
    graph: () => ({ status: 200, body: GRAPH_RESPONSE }),
  });
  await page.goto("/onboarding");
  await page.getByLabel(/langgraph/i).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /create starter/i }).click();
  await expect(page.getByText(/something went wrong/i)).toBeVisible();
  await expect(page.getByText(/bad import in agent\.py/i)).toBeVisible();
  // The recovery hint mentions agent.py.
  await expect(page.locator("p", { hasText: /edit your.*agent\.py/i })).toBeVisible();
  await page.getByRole("button", { name: /retry/i }).click();
  await expect(page.getByText(/Starter Agent is ready/i)).toBeVisible();
  // Graph card visible with at least one agent node rendered by ReactFlow
  await expect(page.getByText("Your agent", { exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 10_000,
  });
});

test("Re-scan: EMPTY → user clicks Re-scan → backend returns ONE_DETECTED → screen flips", async ({
  page,
}) => {
  let calls = 0;
  await setupMocks(page, {
    scan: () => {
      calls++;
      return calls === 1 ? EMPTY_SCAN : ONE_DETECTED_SCAN;
    },
  });
  await page.goto("/onboarding");
  await expect(page.getByText(/let's create your first idun agent/i)).toBeVisible();
  // Click the re-scan link in the EMPTY screen's framework picker footer.
  await page.getByRole("button", { name: /re-scan/i }).click();
  await expect(page.getByText(/found your agent/i)).toBeVisible();
});

test("Login redirect (password mode): /onboarding 401 → /login → submit → back to /onboarding", async ({
  page,
}) => {
  let scanAttempts = 0;
  await page.route("**/admin/api/v1/agent", async (route: Route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_found" } }),
    });
  });
  await page.route(
    "**/admin/api/v1/onboarding/scan",
    async (route: Route) => {
      scanAttempts++;
      if (scanAttempts === 1) {
        await route.fulfill({ status: 401, body: JSON.stringify({}) });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(EMPTY_SCAN),
        });
      }
    },
  );
  await page.route("**/admin/api/v1/auth/login", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/onboarding");
  await page.waitForURL(/\/login\/?\?next=/, { timeout: 15_000 });
  await page.getByLabel(/admin password/i).fill("hunter2");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
  await expect(page.getByText(/let's create your first idun agent/i)).toBeVisible();
});
