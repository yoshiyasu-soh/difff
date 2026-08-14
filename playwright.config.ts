import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  webServer: {
    command: 'npm run build && npm run dev',
    url: 'http://localhost:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:8787',
  },
});
