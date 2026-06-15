import { defineConfig } from 'vitest/config'

// `defineVitestConfig` from `@nuxt/test-utils/config` is NOT used here: it loads the
// full Nuxt test environment, which pulls in `@vue/test-utils` and `happy-dom` (peer
// deps for component/nuxt-environment tests we don't run). Our integration test uses
// `@nuxt/test-utils/e2e` (`setup`/`fetch`), a separate path that needs neither. So we
// inline `@nuxt/test-utils` and the Nuxt `#`-virtual aliases manually instead.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: {
      deps: {
        inline: [/@nuxt\/test-utils/, /#/],
      },
    },
  },
})
