export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['@nuxt/image', '@vite-pwa/nuxt'],
  devtools: { enabled: false },
  image: {
    providers: {
      tiff: { name: 'tiff', provider: '~/providers/tiff.ts' },
    },
  },
  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
    },
    devOptions: { enabled: true, type: 'module', suppressWarnings: true },
  },
})
