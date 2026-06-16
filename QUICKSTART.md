# Quick Start — nuxt-tiff-provider

Render TIFF images through `@nuxt/image`, transcoded to WebP off the main thread
in a Service Worker. This walks you from an empty folder to a running demo.

> **Already have a Nuxt app?** Skip to step 2.

## 1. Create a Nuxt app

```bash
pnpm create nuxt@latest tiff-demo    # or: npm create nuxt@latest tiff-demo
cd tiff-demo
```

Accept the defaults — you don't need to add any of the official modules.

## 2. Install the module

```bash
pnpm add nuxt-tiff-provider
```

That's the only thing you install — `@nuxt/image` and the TIFF decoder come in
automatically.

## 3. Register it

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-tiff-provider'],
})
```

> Don't also add `@nuxt/image` to `modules` — this module installs it. If you
> must list it, it has to come **after** `nuxt-tiff-provider`.

## 4. Add a sample TIFF

The demo loads `/photo.tif`, so put a TIFF at `public/photo.tif`. Use your own,
or generate one with ImageMagick:

```bash
magick logo: public/photo.tif        # ImageMagick 7  (brew install imagemagick)
# ImageMagick 6:  convert logo: public/photo.tif
```

## 5. Render it

Replace your root component — `app.vue` (Nuxt 3) or `app/app.vue` (Nuxt 4) — with:

```vue
<template>
  <main style="max-width: 720px; margin: 2rem auto; font-family: system-ui, sans-serif">
    <h1>nuxt-tiff-provider demo</h1>
    <NuxtImg
      provider="tiff"
      src="/photo.tif"
      width="640"
      sizes="100vw md:640px"
      style="width: 100%; height: auto; border-radius: 8px"
    />
  </main>
</template>
```

No `<script>` needed: on a cold first visit the module re-fetches any image that
raced the Service Worker as soon as it takes control, so the picture appears on
its own — no refresh.

## 6. Run it

```bash
pnpm dev
```

Open **http://localhost:3000**. The TIFF is intercepted, decoded, re-encoded to
WebP, and cached. To confirm: open DevTools → Network and you'll see the request
go out as `/photo.tif?fmt=webp&w=640` with an `image/webp` response. ✅

---

## Options (all optional)

```ts
export default defineNuxtConfig({
  modules: ['nuxt-tiff-provider'],
  tiff: {
    providerName: 'tiff',      // <NuxtImg provider="...">
    cacheName: 'tiff-webp-v1', // Cache API bucket
    quality: 0.8,              // WebP quality 0..1
    scope: '/',                // Service Worker scope
    autoRegister: true,        // false → register the SW yourself
    retryRacedImages: true,    // re-fetch images that raced the SW on first load
  },
})
```

## Good to know

- **Requires Nuxt 3 or 4.**
- **Sources must be same-origin or CORS-readable.**
- **Safari** paints TIFF natively — the SW detects this and passes through.
- **First cold visit:** the browser may request a TIFF before the Service Worker
  controls the page, so it briefly loads the raw `.tif` and fails to decode. The
  module notices the failed image and re-fetches it once the SW is in control —
  no refresh, no page code. Disable with `retryRacedImages: false`. To avoid even
  the brief broken-image flash, render the image only after
  `navigator.serviceWorker.ready` resolves.
