export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['nuxt-tiff-provider'],
  devtools: { enabled: false },
  // Non-default prefix on purpose: proves paramPrefix is configurable and that
  // the provider, SW registration, and SW all honor it end to end.
  // TIFF_WORKERS=0 builds the SW-only arm for the decode benchmark.
  tiff: { paramPrefix: 'tpx', transcodeWorkers: process.env.TIFF_WORKERS !== '0' },
})
