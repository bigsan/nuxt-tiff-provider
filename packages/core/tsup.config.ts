import { defineConfig } from 'tsup'

export default defineConfig([
  // Importable API: ESM + CJS + types. utif2/geotiff/ufo stay external (declared deps).
  {
    entry: { index: 'src/index.ts', url: 'src/url.ts', register: 'src/register.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    external: ['utif2', 'geotiff', 'ufo'],
  },
  // The Service Worker and the page-side transcode worker: self-contained classic
  // IIFEs with everything inlined.
  {
    entry: { 'tiff-sw': 'src/sw.ts', 'tiff-transcode-worker': 'src/transcode-worker.ts' },
    format: ['iife'],
    platform: 'browser',
    target: 'es2020',
    noExternal: [/.*/],
    outExtension: () => ({ js: '.js' }),
    minify: true,
    clean: false,
  },
])
