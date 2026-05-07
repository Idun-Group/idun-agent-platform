import { test, expect } from "@playwright/test";

test("traces page renders heading + search input", async ({ page }) => {
  await page.goto("/traces/");

  await expect(page.getByRole("heading", { name: /^traces$/i })).toBeVisible({
    timeout: 15_000,
  });

  // The session-list filter is a search input with the new placeholder.
  const search = page.locator('input[placeholder*="Search session"]');
  await expect(search).toBeVisible();

  // Sanity: typing updates the controlled value (debounce is 300ms, but the
  // input value updates synchronously).
  await search.fill("nonexistent-zzz");
  await expect(search).toHaveValue("nonexistent-zzz");
});

test("traces appear after a chat turn and Open reveals a sheet", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('textarea[placeholder^="Message"]')
    .fill("trace me");
  await page.getByRole("button", { name: /send message/i }).click();

  // The user bubble rendering also enqueues the trace writer. Give the
  // backend a moment to flush before we navigate away.
  await expect(page.locator("text=trace me").first()).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(2500);

  await page.goto("/traces/");
  // Wait for the table to populate. (TracesPage shows a "No sessions yet…"
  // empty state when the list is empty — we want at least one row.)
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });

  // Click the "Open" action on the first row → opens the SessionSheet.
  await firstRow.getByRole("button", { name: /^open$/i }).click();

  // SessionSheet renders inside a Radix dialog with a font-mono SheetTitle
  // showing the truncated session id.
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
});
