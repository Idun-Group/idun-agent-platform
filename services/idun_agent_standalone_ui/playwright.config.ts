import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the standalone UI E2E suite.
 *
 * The harness assumes a live `idun-standalone serve` process is reachable at
 * `E2E_BASE_URL` (default http://127.0.0.1:8000). `e2e/boot-standalone.sh`
 * boots one with the bundled echo agent and `IDUN_ADMIN_AUTH_MODE=none`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
