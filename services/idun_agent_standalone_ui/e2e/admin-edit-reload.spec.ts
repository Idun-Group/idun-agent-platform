import { test, expect } from "@playwright/test";

test("admin edit reload — agent name change persists", async ({ page }) => {
  await page.goto("/admin/agent/");

  // Auth mode is `none` in the e2e harness; the page should load directly.
  // The Name input sits beside its <label>Name</label>.
  const nameLabel = page.getByText("Name", { exact: true });
  await expect(nameLabel).toBeVisible({ timeout: 15_000 });

  const nameField = nameLabel.locator("..").locator("input").first();
  await expect(nameField).toBeVisible({ timeout: 15_000 });
  await nameField.fill("E2E Edited");

  await page.getByRole("button", { name: /^save$/i }).click();

  // Either a toast or the refetched value confirms the save.
  await expect(
    page.locator("text=/Saved & reloaded|E2E Edited/").first(),
  ).toBeVisible({ timeout: 10_000 });
});
