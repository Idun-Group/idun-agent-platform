import { test, expect } from "@playwright/test";

test("traces appear after a chat turn", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Message…").fill("trace me");
  await page.getByRole("button", { name: /send/i }).click();

  // Wait for the streaming run to complete and the trace writer to flush.
  await expect(page.locator("text=/echo:\\s*trace me/i").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(2000);

  await page.goto("/traces/");
  await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("table tbody tr").first()).toBeVisible({
    timeout: 10_000,
  });
});
