import { expect, test, type Route } from "@playwright/test";

/**
 * E2E asserting the session-replay masking attributes shipped by Task 16
 * are present in the rendered DOM. These tests do NOT verify session
 * replay capture behavior end-to-end (would require a real PostHog ingest,
 * out of scope). The selectors mirror lib/telemetry/client.ts:
 *   maskTextSelector: "[data-ph-mask], .ph-mask-text"
 *   blockSelector:    "[data-ph-no-capture]"
 */

test.describe("session-replay masking", () => {
  test("login form has data-ph-mask", async ({ page }) => {
    // The standalone server boots with authMode "none" in this e2e suite,
    // so /login auto-redirects to /. Override runtime-config.js to mark
    // this page as password-mode so the form actually renders — same
    // pattern as onboarding.spec.ts's password-mode login test.
    await page.route("**/runtime-config.js", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `window.__IDUN_CONFIG__ = ${JSON.stringify({
          theme: {
            appName: "Idun Agent",
            greeting: "How can I help?",
            starterPrompts: [],
            logo: { text: "IA" },
            layout: "branded",
            radius: "0.625",
            fontSans: "",
            fontSerif: "",
            fontMono: "",
            defaultColorScheme: "system",
            colors: { light: {}, dark: {} },
          },
          authMode: "password",
          layout: "branded",
        })};\n`,
        headers: { "Cache-Control": "no-store" },
      });
    });

    await page.goto("/login");
    await expect(page.locator("form[data-ph-mask]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("chat textarea has data-ph-mask", async ({ page }) => {
    // Chat is the default landing surface when unauthenticated under
    // authMode=none (the suite's default boot config).
    await page.goto("/");
    const textarea = page.locator("textarea[data-ph-mask]");
    await expect(textarea).toBeVisible({ timeout: 15_000 });
  });

  test("user message bubble has data-ph-no-capture after sending", async ({
    page,
  }) => {
    // MessageView.tsx wraps every user bubble in `data-ph-no-capture` so
    // session-replay never records typed prompts. Send a message via the
    // composer and assert the wrapper appears — does not depend on the
    // backend echo reply (only the immediate optimistic user render).
    await page.goto("/");
    const textarea = page.locator("textarea[data-ph-mask]");
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill("ping");
    await page.getByRole("button", { name: /send message/i }).click();
    const bubble = page.locator("[data-ph-no-capture]").first();
    await expect(bubble).toBeVisible({ timeout: 10_000 });
  });
});
