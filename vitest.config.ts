import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['app/providers/**', 'service-worker/**'],
      // Excluded: browser-only APIs unavailable in node (Design Decision 5).
      exclude: ['service-worker/sw.ts', 'service-worker/encoder.ts'],
    },
  },
})
