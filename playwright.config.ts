import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm gen:samples && pnpm build && PORT=3100 pnpm preview',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
