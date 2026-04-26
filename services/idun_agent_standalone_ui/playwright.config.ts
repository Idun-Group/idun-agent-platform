import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the standalone UI E2E suite.
 *
 * Default behaviour: `pnpm test:e2e` boots its own backend via
 * `e2e/boot-standalone.sh`, which builds the UI into a temp dir and runs
 * `idun-standalone serve` against the bundled echo agent. No source-tree
 * mutation, no shared port, fully self-contained.
 *
 * If `E2E_BASE_URL` is set, we assume the caller has already booted a
 * server (e.g. a dev loop pointing at :8000) and skip the auto-boot.
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:8001";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "./e2e/boot-standalone.sh",
        url: `${BASE_URL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
