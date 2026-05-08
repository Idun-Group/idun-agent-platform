import { test, expect } from "@playwright/test";

/**
 * The AppSidebar renders a "Developer" group with two external links:
 *   - /docs   → Swagger UI
 *   - /redoc  → ReDoc
 *
 * Both render as <a target="_blank" rel="noopener noreferrer"> wrapped in a
 * shadcn SidebarMenuButton (asChild). The group label "Developer" comes from
 * <SidebarGroupLabel>. Auth mode is `none` in the e2e harness, so /admin/
 * loads directly — see admin-shell.spec.ts and admin-edit-reload.spec.ts for
 * the same pattern.
 */

test.describe("admin sidebar — Developer group", () => {
  test("renders /docs and /redoc external links", async ({ page }) => {
    await page.goto("/admin/");

    // Wait for the sidebar to mount before asserting on its contents. The
    // shadcn Sidebar root carries data-slot="sidebar".
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Group label — SidebarGroupLabel renders the literal text "Developer".
    // Scope to the sidebar so we don't collide with any future occurrence of
    // the word elsewhere on the page.
    const developerLabel = sidebar.getByText("Developer", { exact: true });
    await expect(developerLabel).toBeVisible();

    // Swagger entry. The visible text is "API Docs (Swagger)" but the
    // accessible name is composed by the surrounding <a>, so getByRole("link")
    // matches on the link's accessible name.
    const swagger = sidebar.getByRole("link", { name: /API Docs \(Swagger\)/ });
    await expect(swagger).toBeVisible();
    await expect(swagger).toHaveAttribute("href", "/docs");
    await expect(swagger).toHaveAttribute("target", "_blank");
    await expect(swagger).toHaveAttribute("rel", /noopener/);

    // ReDoc entry.
    const redoc = sidebar.getByRole("link", { name: /API Reference/ });
    await expect(redoc).toBeVisible();
    await expect(redoc).toHaveAttribute("href", "/redoc");
    await expect(redoc).toHaveAttribute("target", "_blank");
    await expect(redoc).toHaveAttribute("rel", /noopener/);
  });
});
