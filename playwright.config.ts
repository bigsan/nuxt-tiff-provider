import { defineConfig, devices } from '@playwright/test'

const PARSED_PORT = Number(process.env.E2E_PORT)
// Default to an uncommon port to avoid colliding with Nuxt dev, Grafana, and the
// many other local servers that sit on 3000.
const PORT = Number.isNaN(PARSED_PORT) ? 3737 : PARSED_PORT
const CORS_PORT = Number(process.env.E2E_CORS_PORT) || 3738
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './playground/test/e2e',
  timeout: 60_000,
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        `pnpm run gen:samples && pnpm run build:packages && ` +
        `pnpm --filter playground build && PORT=${PORT} pnpm --filter playground preview`,
      url: BASE_URL,
      // Never reuse a server already on this port: it may be a stale build or an
      // unrelated app, which would silently make the suite test the wrong bytes.
      // Always build and serve the playground fresh.
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      // A second origin (different port) with CORS, to exercise the SW's
      // cross-origin transcode path. gen:samples first so the file exists.
      command: `pnpm run gen:samples && CORS_PORT=${CORS_PORT} pnpm run cors:samples`,
      url: `http://localhost:${CORS_PORT}/rgb8.tif`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
