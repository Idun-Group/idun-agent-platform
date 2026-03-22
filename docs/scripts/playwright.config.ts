import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'capture-screenshots.ts',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'off',
    actionTimeout: 10_000,
  },
  timeout: 180_000,
  retries: 0,
});
