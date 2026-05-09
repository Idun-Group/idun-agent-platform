import { expect, test } from "@playwright/test";

const SENTINEL = "qwertanu";

// This spec exercises the admin REST → commit_with_reload → engine pickup
// pipeline by adding a BAN_LIST guardrail. The engine's guardrail
// converter requires GUARDRAILS_API_KEY AND a working Guardrails Hub
// install path. The e2e-real-llm.yml Playwright job pre-installs
// hub://guardrails/ban_list before the run; the standalone-ci.yml
// E2E (Playwright) job does not (and shouldn't — its boot uses an
// echo agent). Gate on LLM_PROVIDER (same gate chat-real-llm.spec.ts
// uses) so the spec only fires from e2e-real-llm.yml, and additionally
// require GUARDRAILS_API_KEY for the engine's converter.
test.skip(
  !process.env.LLM_PROVIDER || !process.env.GUARDRAILS_API_KEY,
  "admin-edit-and-reload requires LLM_PROVIDER + GUARDRAILS_API_KEY; runs from the e2e-real-llm.yml Playwright job which exports both AND pre-installs the BAN_LIST validator.",
);

test("admin guardrail addition triggers reload — chat with sentinel blocked", async ({
  page,
  request,
}) => {
  await page.goto("/");
  // baseURL is configured by playwright.config.ts; we infer from page.url().
  const baseURL = new URL(page.url() || "/", page.url() || "http://127.0.0.1").origin;

  // Pre-reload: send the sentinel-bearing prompt directly via the engine
  // API. Should succeed (no guardrail registered yet).
  const preRun = await request.post(`${baseURL}/agent/run`, {
    headers: { Accept: "text/event-stream" },
    data: {
      threadId: "pre-reload",
      runId: "pre-reload",
      messages: [{ id: "m1", role: "user", content: `hello (${SENTINEL})` }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    },
  });
  expect(preRun.status()).toBe(200);

  // Add a BAN_LIST input guard. Field shape is the same as pytest scenario 7
  // (verified against StandaloneGuardrailCreate + ManagerBanListConfig
  // schemas during Task 2.6 implementation):
  //   - top-level: name, position, enabled, guardrail
  //   - inner guardrail: snake_case (config_id, banned_words)
  //   - reload status enum value: "reloaded" (lowercase)
  const create = await request.post(`${baseURL}/admin/api/v1/guardrails`, {
    data: {
      name: "e2e-ui-ban-sentinel",
      position: "input",
      enabled: true,
      guardrail: {
        config_id: "ban_list",
        banned_words: [SENTINEL],
      },
    },
  });
  expect([200, 201]).toContain(create.status());
  const createBody = await create.json();
  expect(createBody.reload?.status).toBe("reloaded");

  // Reload the admin page and verify the new guardrail row is visible.
  await page.goto("/admin/guardrails");
  await expect(page.getByText("e2e-ui-ban-sentinel")).toBeVisible({
    timeout: 15_000,
  });

  // Post-reload: same chat is now blocked.
  const postRun = await request.post(`${baseURL}/agent/run`, {
    headers: { Accept: "text/event-stream" },
    data: {
      threadId: "post-reload",
      runId: "post-reload",
      messages: [{ id: "m2", role: "user", content: `hello (${SENTINEL})` }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    },
  });
  expect(postRun.status()).toBe(429);
});
