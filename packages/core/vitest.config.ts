import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Browser-only APIs unavailable in node: the SW entry and the encoder.
      exclude: ['src/sw.ts', 'src/encoder.ts', 'src/register.ts'],
    },
  },
})
