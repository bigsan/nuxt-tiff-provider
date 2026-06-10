import { defineConfig, devices } from '@playwright/test'

// Spec targets port 3000; override with E2E_PORT for local runs (e.g. when
// Grafana already occupies 3000, use E2E_PORT=3100).
const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm gen:samples && pnpm build && PORT=${PORT} pnpm preview`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
