import { test, expect } from "@playwright/test";

test("chat happy path — user message is echoed back", async ({ page }) => {
  await page.goto("/");

  // ChatInput renders a textarea with placeholder "Message…".
  const input = page.getByPlaceholder("Message…");
  await expect(input).toBeVisible({ timeout: 15_000 });

  await input.fill("ping");
  await page.getByRole("button", { name: /send/i }).click();

  // The user bubble appears immediately. The echo agent prepends "echo: ".
  await expect(page.locator("text=ping").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("text=/echo:\\s*ping/i").first()).toBeVisible({
    timeout: 15_000,
  });
});
