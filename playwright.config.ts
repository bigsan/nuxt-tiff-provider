import { defineConfig, devices } from '@playwright/test'

const PARSED_PORT = Number(process.env.E2E_PORT)
const PORT = Number.isNaN(PARSED_PORT) ? 3000 : PARSED_PORT
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './playground/test/e2e',
  timeout: 60_000,
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      `pnpm run gen:samples && pnpm run build:packages && ` +
      `pnpm --filter playground build && PORT=${PORT} pnpm --filter playground preview`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
