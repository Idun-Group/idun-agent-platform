import { test, expect, type Route, type Page } from "@playwright/test";

/**
 * E2E tests for the guided product tour.
 *
 * The tour fires from ?tour=start. To exercise the full flow we use
 * page.route() to mock /admin/api/v1/agent (so the chat root accepts the
 * existence of an agent and renders WelcomeHero) plus the onboarding
 * endpoints (so the wizard happy path runs without hitting the live
 * standalone backend's seeded state).
 */

async function mockAgent(page: Page) {
  await page.route("**/admin/api/v1/agent", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "x",
        slug: "starter-agent",
        name: "Starter Agent",
        description: null,
        version: null,
        status: "draft",
        baseUrl: null,
        baseEngineConfig: {},
        createdAt: "2026-04-29T00:00:00Z",
        updatedAt: "2026-04-29T00:00:00Z",
      }),
    });
  });
}

async function mockWizardEmptyHappyPath(page: Page) {
  // Onboarding scan returns EMPTY so the user picks LangGraph → starter.
  await page.route(
    "**/admin/api/v1/onboarding/scan",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: "EMPTY",
          scanResult: {
            root: "/tmp",
            detected: [],
            hasPythonFiles: false,
            hasIdunConfig: false,
            scanDurationMs: 5,
          },
        }),
      });
    },
  );
  await page.route(
    "**/admin/api/v1/onboarding/create-starter",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "x",
            slug: "starter-agent",
            name: "Starter Agent",
            description: null,
            version: null,
            status: "draft",
            baseUrl: null,
            baseEngineConfig: {},
            createdAt: "2026-04-29T00:00:00Z",
            updatedAt: "2026-04-29T00:00:00Z",
          },
        }),
      });
    },
  );
}

test("happy path: wizard Done → tour fires, advances through 5 steps, marks completed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAgent(page);
  await mockWizardEmptyHappyPath(page);

  // Step through the wizard.
  await page.goto("/onboarding");
  await page.getByLabel(/langgraph/i).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /create starter/i }).click();
  await expect(page.getByText(/Starter Agent is ready/i)).toBeVisible();

  // Click Go to chat — assert URL transitions through ?tour=start.
  await page.getByRole("button", { name: /go to chat/i }).click();
  // The provider strips the param via router.replace — final URL is /.
  await page.waitForURL(/\/(?:\?.*)?$/, { timeout: 5_000 });

  // Step 0 popover anchored on chat composer.
  await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".driver-popover-title")).toHaveText("Chat");

  // Click Next → step 1: navigates to /admin/agent.
  await page.locator(".driver-popover-next-btn").click();
  await page.waitForURL(/\/admin\/agent\/?$/);
  await expect(page.locator(".driver-popover-title")).toHaveText("Admin config");

  // Click Next → step 2 (same route).
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Prompts, tools, and guardrails",
  );

  // Click Next → step 3 (same route).
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText("Observability");

  // Click Next → step 4 (modal-only deployment).
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText("Deployment");

  // Click Done — popover dismisses, completion flag set.
  // Driver.js reuses .driver-popover-next-btn for the Done button (label
  // changes via doneBtnText), so the same locator captures it.
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover")).not.toBeVisible();
  // Poll the flag — the last-step Done handler runs synchronously inside
  // onNextClick but page.evaluate's IPC may overlap the React commit, so
  // we let expect.poll settle on the post-commit value.
  await expect
    .poll(
      () =>
        page.evaluate(() => localStorage.getItem("idun.tour.completed")),
      { timeout: 5_000 },
    )
    .toBe("true");

  // Reload the chat root — assert tour does NOT re-fire without ?tour=start.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".driver-popover")).not.toBeVisible();
});

test("mobile-skip: ?tour=start at viewport <md silently marks completed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await mockAgent(page);

  await page.goto("/?tour=start");
  await page.waitForLoadState("networkidle");

  // No popover renders.
  await expect(page.locator(".driver-popover")).toHaveCount(0);

  // Completion flag set.
  const completed = await page.evaluate(() =>
    localStorage.getItem("idun.tour.completed"),
  );
  expect(completed).toBe("true");

  // URL has been stripped of ?tour=start.
  expect(page.url()).not.toContain("tour=start");
});

test("replay: ?tour=start always fires even after prior completion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAgent(page);

  // Pre-set the completion flag — simulating a user who already finished
  // the tour once.
  await page.addInitScript(() => {
    localStorage.setItem("idun.tour.completed", "true");
  });

  await page.goto("/?tour=start");

  // Tour fires regardless of prior completion.
  await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".driver-popover-title")).toHaveText("Chat");

  // Flag has been cleared (the trigger always clears).
  const completed = await page.evaluate(() =>
    localStorage.getItem("idun.tour.completed"),
  );
  expect(completed).toBeNull();
});
