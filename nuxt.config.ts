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
    // Nuxt 4 makes `app/` Vite's root, and vite-plugin-pwa resolves the SW
    // entry as resolve(viteRoot, srcDir, filename). Climb back up so the SW is
    // found at the project-root `service-worker/sw.ts`, not `app/service-worker/`.
    srcDir: '../service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
    },
    devOptions: { enabled: true, type: 'module', suppressWarnings: true },
  },
})
