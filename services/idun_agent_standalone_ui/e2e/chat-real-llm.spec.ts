import { expect, test } from "@playwright/test";

// Selectors mirror chat.spec.ts. The chat surface has no data-testid —
// we use placeholder + role idioms.

test("chat happy path with real LLM streams a non-empty assistant reply", async ({
  page,
}) => {
  await page.goto("/");

  const input = page.locator('textarea[placeholder^="Message"]');
  await expect(input).toBeVisible({ timeout: 30_000 });

  // Baseline of static page text BEFORE sending the prompt — used to
  // compute the post-send delta so static UI strings (greeting,
  // starter prompts, sidebar) can't satisfy the length predicate.
  const baseline = (await page.locator("body").innerText())
    .replace(/Message[^\n]*/g, "")
    .trim();

  const prompt = "Say hello in one short sentence.";
  await input.fill(prompt);
  await page.getByRole("button", { name: /send message/i }).click();

  // User bubble appears immediately.
  await expect(page.locator(`text=${prompt}`).first()).toBeVisible({
    timeout: 10_000,
  });

  // Wait for assistant reply. The chat doesn't tag assistant bubbles
  // with a stable testid; we poll the page for the post-send delta
  // (everything that isn't already in the baseline + the prompt) and
  // assert the new content exceeds 20 chars.
  let lastReply = "";
  await expect
    .poll(
      async () => {
        const all = await page.locator("body").innerText();
        const transcript = all.replace(/Message[^\n]*/g, "").trim();
        const delta = transcript.replace(baseline, "").replace(prompt, "").trim();
        lastReply = delta;
        return delta.length;
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
