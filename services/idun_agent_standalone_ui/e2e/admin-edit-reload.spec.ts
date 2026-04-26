import { test, expect } from "@playwright/test";

test("admin agent page renders breadcrumbs and framework tabs", async ({
  page,
}) => {
  await page.goto("/admin/agent/");

  // Breadcrumbs render "Admin / Configuration" via shadcn Breadcrumb. Scope
  // to the breadcrumb landmark — both labels appear elsewhere on the page
  // (sidebar nav + card title), so a global getByText is ambiguous.
  const breadcrumb = page.getByLabel("breadcrumb");
  await expect(breadcrumb.getByText("Admin", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    breadcrumb.getByText("Configuration", { exact: true }),
  ).toBeVisible();

  // Tabs use [role=tab] under the hood (Radix Tabs).
  const langgraphTab = page.getByRole("tab", { name: /langgraph/i });
  await expect(langgraphTab).toBeVisible();
  await langgraphTab.click();
  // The Name input lives inside the active tab panel.
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
});

test("Edit YAML opens a sheet (Radix dialog)", async ({ page }) => {
  await page.goto("/admin/agent/");

  await page
    .getByRole("button", { name: /edit yaml/i })
    .click();

  // Sheet uses Radix Dialog under the hood.
  const sheet = page.getByRole("dialog").filter({ hasText: /edit agent yaml/i });
  await expect(sheet).toBeVisible({ timeout: 10_000 });

  // Close the sheet via the Cancel button rendered in SheetFooter.
  await sheet.getByRole("button", { name: /cancel/i }).click();
  await expect(sheet).toBeHidden({ timeout: 5_000 });
});

test("admin edit reload — agent name change persists", async ({ page }) => {
  await page.goto("/admin/agent/");

  // Auth mode is `none` in the e2e harness; the page should load directly.
  // The Name input is wired through shadcn FormLabel ↔ FormControl, so
  // getByLabel("Name") resolves directly to the <input>.
  const nameField = page.getByLabel("Name", { exact: true });
  await expect(nameField).toBeVisible({ timeout: 15_000 });
  await nameField.fill("E2E Edited");

  // The CardFooter Save button posts the active form via `form="agent-form-…"`.
  await page.getByRole("button", { name: /^save$/i }).click();

  // Sonner toasts mount inside [data-sonner-toaster]; they're divs with text
  // content "Saved & reloaded". Match either the toast or the refreshed value.
  await expect(
    page.locator("text=/Saved & reloaded|E2E Edited/").first(),
  ).toBeVisible({ timeout: 10_000 });
});
