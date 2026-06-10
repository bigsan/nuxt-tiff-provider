# Nuxt TIFF Provider (MVP)

Render TIFF images in any browser via a custom `@nuxt/image` provider that
transcodes TIFF → WebP **off the main thread** in a Service Worker.

## How it works

1. `<NuxtImg provider="tiff" src="/x.tif" width=640>` → the provider emits
   `/x.tif?fmt=webp&w=640` (+ `srcset`). The provider is a pure, synchronous,
   isomorphic URL builder — no decoding happens here.
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
