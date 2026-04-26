import { test, expect } from "@playwright/test";

/**
 * Smoke checks for the shadcn admin shell:
 *   - Cmd+K (or Ctrl+K) opens the GlobalCommand palette.
 *   - The sidebar collapses to icon mode via SidebarTrigger.
 *   - ThemeToggle flips the `dark` class on <html>.
 */

test("Cmd+K opens the command palette", async ({ page }, testInfo) => {
  await page.goto("/admin/");

  // Layout binds Cmd/Ctrl+K globally. Use Control on linux, Meta elsewhere.
  const isMac = ["darwin", "Darwin", "macos"].some((m) =>
    testInfo.project.use.userAgent?.toString().includes(m),
  );
  const modifier = process.platform === "darwin" || isMac ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+k`);

  // CommandDialog uses Radix Dialog. Its CommandInput placeholder is
  // "Type a command or search…".
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByPlaceholder(/Type a command/i)).toBeVisible();
});

test("Sidebar collapses to icon via the trigger", async ({ page }) => {
  await page.goto("/admin/");

  // The shadcn Sidebar root has data-slot="sidebar" + data-state="expanded"
  // when open, "collapsed" when collapsed. Match by data-slot to dodge the
  // duplicate inner [data-sidebar="sidebar"] node.
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await expect(sidebar).toHaveAttribute("data-state", "expanded", {
    timeout: 10_000,
  });

  // SidebarTrigger renders an icon button with sr-only "Toggle Sidebar" text.
  await page.getByRole("button", { name: /toggle sidebar/i }).first().click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed", {
    timeout: 5_000,
  });
});

test("ThemeToggle flips the .dark class on <html>", async ({ page }) => {
  await page.goto("/admin/");

  const html = page.locator("html");

  // Force a known starting state via the dropdown to avoid relying on the
  // host's `prefers-color-scheme`.
  await page.getByRole("button", { name: /toggle theme/i }).click();
  await page.getByRole("menuitem", { name: /^light/i }).click();
  await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 });

  // Switch to dark — html.classList must contain `dark`.
  await page.getByRole("button", { name: /toggle theme/i }).click();
  await page.getByRole("menuitem", { name: /^dark/i }).click();
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 });

  // Back to light — `dark` class must be gone again.
  await page.getByRole("button", { name: /toggle theme/i }).click();
  await page.getByRole("menuitem", { name: /^light/i }).click();
  await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 });
});
