# nuxt-tiff-provider

Render TIFF images in any browser through `@nuxt/image`, transcoding TIFF → WebP
off the main thread in a Service Worker.

## Install

```bash
pnpm add nuxt-tiff-provider
```

```ts
// nuxt.config.ts — do NOT also list @nuxt/image; this module installs it.
export default defineNuxtConfig({
  modules: ['nuxt-tiff-provider'],
})
```

## Use

```vue
<NuxtImg provider="tiff" src="/photo.tif" width="640" sizes="100vw md:640px" />
```

## Options

```ts
export default defineNuxtConfig({
  tiff: {
    providerName: 'tiff',      // <NuxtImg provider="...">
    cacheName: 'tiff-webp-v1', // Cache API bucket
    quality: 0.8,              // default WebP quality 0..1
    scope: '/',                // Service Worker scope
    autoRegister: true,        // false → call registerTiffServiceWorker() yourself
  },
})
```

## Notes

- Safari paints TIFF natively; the SW detects this and passes through.
- Already run your own Service Worker? Set `autoRegister: false` and
  `importScripts('/tiff-sw.js')` inside it (see `@tiff-provider/core`).
- Sources must be same-origin or CORS-readable.
