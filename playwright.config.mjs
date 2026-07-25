import { defineConfig } from '@playwright/test';

const previewPort = process.env.PLAYWRIGHT_PORT || '4179';

export const APP_URL = `http://127.0.0.1:${previewPort}/encode-decode-tool/`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  timeout: 20_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: APP_URL,
    browserName: 'chromium',
    permissions: ['clipboard-read', 'clipboard-write'],
    screenshot: 'off',
    trace: 'on-first-retry',
    video: 'off',
  },
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${previewPort}`,
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
