import { expect, test } from "@playwright/test";

// Selectors mirror chat.spec.ts. The chat surface has no data-testid —
// we use placeholder + role idioms.

test("chat happy path with real LLM streams a non-empty assistant reply", async ({
  page,
}) => {
  await page.goto("/");

  const input = page.locator('textarea[placeholder^="Message"]');
  await expect(input).toBeVisible({ timeout: 30_000 });

  const prompt = "Say hello in one short sentence.";
  await input.fill(prompt);
  await page.getByRole("button", { name: /send message/i }).click();

  // User bubble appears immediately.
  await expect(page.locator(`text=${prompt}`).first()).toBeVisible({
    timeout: 10_000,
  });

  // Wait for assistant reply. The chat doesn't tag assistant bubbles
  // with a stable testid; we poll the page for any post-user text that
  // is at least 20 chars (filtering out the prompt itself + the
  // composer placeholder).
  let lastReply = "";
  await expect
    .poll(
      async () => {
        const all = await page.locator("body").innerText();
        const trimmed = all
          .replace(prompt, "")
          .replace(/Message[^\n]*/g, "")
          .trim();
        lastReply = trimmed;
        return trimmed.length;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBeGreaterThan(20);

  // Guard against silent fallback to the echo agent. boot-standalone.sh
  // swaps the agent module when LLM_PROVIDER is set; if that swap ever
  // regresses, length alone would still pass — assert the echo prefix
  // is absent so the gate stays meaningful.
  expect(lastReply.toLowerCase()).not.toContain("echo:");
});
