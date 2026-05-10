/**
 * README screenshot capture spec.
 *
 * Generates the 8 PNGs referenced from README.md (the chat shot also
 * doubles as the docs quickstart "first message" screenshot). Output goes
 * to docs/images/readme/* relative to the repo root.
 *
 * Run: pnpm --filter idun-agent-standalone-ui exec playwright test e2e/readme-screenshots.spec.ts
 *
 * Boot prerequisite: e2e/boot-standalone.sh has spun up standalone with
 * the bundled echo agent. Playwright's webServer config in
 * playwright.config.ts handles this automatically (see boot-standalone.sh
 * for the inline LangGraph echo fixture — there is no separate maximal
 * fixture; the standalone is a single-agent deployment).
 *
 * Routes: see services/idun_agent_standalone_ui/CLAUDE.md. Admin routes
 * are singletons (`/admin/agent`, `/admin/mcp`, `/admin/memory`,
 * `/admin/observability`, `/admin/guardrails`, `/admin/prompts`) — there
 * is no `/admin/agents/:id` because the standalone is single-agent.
 */
import { test, type Page } from "@playwright/test";
import path from "path";

// Playwright runs from services/idun_agent_standalone_ui (where
// playwright.config.ts lives). The repo root is two levels up. We avoid
// `import.meta.url` because the package is not "type": "module" and
// Playwright transpiles specs to CommonJS.
const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "docs", "images", "readme");

const VIEWPORT = { width: 1440, height: 900 };

test.use({ viewport: VIEWPORT, colorScheme: "light" });

async function captureRoute(page: Page, route: string, outFile: string) {
  await page.goto(route, { waitUntil: "networkidle" });
  // Allow async data fetches and entry animations to settle before the
  // shutter fires. Admin pages render skeletons while React Query
  // resolves; 750ms is enough headroom for the bundled fixtures.
  await page.waitForTimeout(750);
  await page.screenshot({
    path: path.join(OUT_DIR, outFile),
    fullPage: false,
    animations: "disabled",
  });
}

test.describe("README screenshot capture", () => {
  test("dashboard.png — admin landing", async ({ page }) => {
    // The dashboard page mounts even though the sessions backend is
    // deferred (see services/idun_agent_standalone_ui/CLAUDE.md). Empty
    // KPIs / "Coming soon" badges are intentional in v0.6 README art.
    await captureRoute(page, "/admin/", "dashboard.png");
  });

  test("agent-detail.png — agent identity + base config", async ({ page }) => {
    // Single-agent deployment: the admin "agent" surface is a singleton
    // at /admin/agent (no list, no per-id route).
    await captureRoute(page, "/admin/agent", "agent-detail.png");
  });

  test("chat.png — mid-conversation", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Chat composer: the textarea placeholder is "Message <appName>…"
    // (set by ChatInput.tsx). Send button has aria-label "Send message".
    const input = page.locator('textarea[placeholder^="Message"]');
    const sendBtn = page.getByRole("button", { name: /send message/i });

    const messages = [
      "Hi, who are you?",
      "Add 17 + 25 for me",
      "What can you do?",
    ];
    for (const m of messages) {
      await input.fill(m);
      await sendBtn.click();
      // The bundled echo agent's MESSAGES_SNAPSHOT lands within ~1s in
      // headless Chromium. Two seconds gives the assistant bubble time to
      // hydrate before we send the next prompt.
      await page.waitForTimeout(2000);
    }
    // Final settle so the last assistant bubble is fully painted.
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(OUT_DIR, "chat.png"),
      fullPage: false,
      animations: "disabled",
    });
  });

  test("guardrails.png — guardrails catalog", async ({ page }) => {
    await captureRoute(page, "/admin/guardrails", "guardrails.png");
  });

  test("mcp.png — MCP servers list", async ({ page }) => {
    // Route is /admin/mcp (not /admin/mcp-servers — the page mounts at
    // app/admin/mcp/page.tsx and calls /admin/api/v1/mcp-servers under
    // the hood).
    await captureRoute(page, "/admin/mcp", "mcp.png");
  });

  test("memory.png — memory configuration", async ({ page }) => {
    await captureRoute(page, "/admin/memory", "memory.png");
  });

  test("observability.png — observability providers", async ({ page }) => {
    await captureRoute(page, "/admin/observability", "observability.png");
  });

  test("prompts.png — prompts list", async ({ page }) => {
    await captureRoute(page, "/admin/prompts", "prompts.png");
  });
});
