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
  // The Service Worker artifact: one self-contained classic IIFE, everything inlined.
  {
    entry: { 'tiff-sw': 'src/sw.ts' },
    format: ['iife'],
    platform: 'browser',
    target: 'es2020',
    noExternal: [/.*/],
    outExtension: () => ({ js: '.js' }),
    minify: true,
    clean: false,
  },
])
