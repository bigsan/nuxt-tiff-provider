# @tiff-provider/core

Framework-agnostic in-browser TIFF→WebP transcoder. Ships the decode/encode
logic and a **prebuilt classic Service Worker** (`tiff-sw.js`) with `utif` +
`geotiff` (all codecs) inlined. For Nuxt, use `nuxt-tiff-provider` instead.

## Register the Service Worker

```ts
import { registerTiffServiceWorker } from '@tiff-provider/core/register'

// Serve dist/tiff-sw.js at your site root, then:
registerTiffServiceWorker({ scope: '/', cacheName: 'tiff-webp-v1', quality: 0.8 })
```

## Build a provider URL

```ts
import { buildTiffUrl } from '@tiff-provider/core/url'
buildTiffUrl('/photo.tif', { width: 640 }) // → /photo.tif?fmt=webp&w=640
```

## Compose into an existing Service Worker

The same artifact works via `importScripts('/tiff-sw.js')` inside your own SW.

## API

`decodeTiff`, `decodeWithUtif`, `decodeWithGeotiff`, `normalizeToRgba`,
`encodeWebp`, `buildTiffUrl`, `shouldIntercept`, `parseModifiers`,
`isTiffPath`, `decideStrategy`, `registerTiffServiceWorker`, `detectNativeTiff`.
