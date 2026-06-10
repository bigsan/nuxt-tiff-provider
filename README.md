# Nuxt TIFF Provider (MVP)

Render TIFF images in any browser via a custom `@nuxt/image` provider that
transcodes TIFF → WebP **off the main thread** in a Service Worker.

## How it works

1. `<NuxtImg provider="tiff" src="/x.tif" width=640>` → the provider emits
   `/x.tif?fmt=webp&w=640`; given `sizes`, `@nuxt/image` calls the provider
   once per candidate width and assembles the resulting URLs into a `srcset`.
   The provider is a pure, synchronous, isomorphic URL builder — no decoding
   happens here.
2. A Service Worker intercepts `.tif`/`.tiff` requests carrying `fmt`:
   cache hit → serve WebP; miss → fetch raw bytes, decode (UTIF → geotiff.js
   fallback), resize + encode to WebP via `OffscreenCanvas`, cache, return.
3. Safari (native TIFF) is detected client-side and the SW passes through.

## Develop

```bash
pnpm install
pnpm gen:samples   # generate TIFF fixtures into public/samples + tests/fixtures
pnpm dev           # http://localhost:3000
```

## Test

```bash
pnpm test:unit                 # vitest (provider, router, decoder)
pnpm exec playwright install chromium
pnpm test:e2e                  # Playwright (render, liveness, cache)
```

## Layout

- `app/providers/tiff.ts` — modifier → URL strategy (pure/isomorphic)
- `service-worker/{sw,router,decoder,encoder}.ts` — off-thread transcode
- `app/plugins/tiff-capability.client.ts` — native-TIFF (Safari) passthrough
- `app/pages/index.vue` — demo + main-thread liveness proof
- `scripts/gen-samples.ts` — deterministic fixtures

## Known limits (MVP)

Whole-image transcode (no COG tiling); a Service Worker may be terminated on
gigapixel files — the documented scaling path is a page-side Worker pool.

16-bit and other non-baseline TIFFs decode via the geotiff fallback. geotiff
lazy-loads its codec modules with a runtime `import()`, which the HTML spec
forbids inside a Service Worker ([w3c/ServiceWorker#1356][sw1356]), so the dev
SW (served as an ES module) statically pre-registers only the uncompressed
(raw) codec — the format of the sole >8-bit fixture. Compressed >8-bit TIFFs
(LZW/Deflate/JPEG, …) therefore do not decode in the **dev** SW: geotiff's
`exports` map blocks the codec subpaths, so those classes can't be reached to
register them statically. The production build is a classic IIFE with every
codec inlined, so it is unaffected — meaning a compressed 16-bit file can paint
under `pnpm preview` yet fail under `pnpm dev`.

[sw1356]: https://github.com/w3c/ServiceWorker/issues/1356
