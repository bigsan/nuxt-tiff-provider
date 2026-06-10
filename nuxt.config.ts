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
    // This is an off-main-thread transcoder demo, not an installable PWA.
    // @vite-pwa/nuxt otherwise injects a default `manifest.webmanifest` URL into
    // the precache manifest WITHOUT emitting the file, so workbox's install-time
    // precache fetch 404s, `event.waitUntil` rejects, and the SW never installs
    // (goes redundant) — no interception, no transcode. Disabling the manifest
    // removes both the file and its phantom precache entry.
    manifest: false,
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
      // The SW is registered as a CLASSIC worker, so the production bundle must
      // not contain ES-module syntax. The default 'es' format emits
      // `import.meta.url` and Vite's `__vitePreload` helper (which references
      // `document`, undefined in a worker) for geotiff's dynamic decoder
      // imports — making the whole SW fail to evaluate (no interception at all),
      // and the geotiff 16-bit path unrunnable. An IIFE bundle is a single
      // self-contained classic script with all dynamic imports inlined.
      rollupFormat: 'iife',
    },
    // Dev mode serves the SW as a native ES module (Vite dev requires ESM), while
    // the production build above bundles it to a self-contained classic IIFE
    // (rollupFormat: 'iife'). These apply to different builds, so they don't conflict.
    devOptions: { enabled: true, type: 'module', suppressWarnings: true },
  },
})
