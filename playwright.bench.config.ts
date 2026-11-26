import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Decode benchmark: `pnpm run gen:bench-samples && pnpm run bench`.
// Results print to stdout and land in bench-results/<BENCH_LABEL>.json.
export default defineConfig({
  ...base,
  testDir: './playground/test/bench',
  timeout: 15 * 60_000,
  retries: 0,
  workers: 1,
})
