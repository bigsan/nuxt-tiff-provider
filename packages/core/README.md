# @tiff-provider/core

Framework-agnostic in-browser TIFF→WebP transcoder. Ships the decode/encode
logic and a **prebuilt classic Service Worker** (`tiff-sw.js`) with `utif` +
`geotiff` (all codecs) inlined. For Nuxt, use `nuxt-tiff-provider` instead.

## Register the Service Worker

Copy `node_modules/@tiff-provider/core/dist/tiff-sw.js` to your site's public
root (or serve it via your build tool's static-asset mechanism) so it's
reachable at `/tiff-sw.js`, then:

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

> Caveats for this path: the engine reads its `?cache=` / `?q=` config from the
> **top-level** service worker's URL, so options passed on the
> `importScripts('/tiff-sw.js?...')` URL are NOT read — rely on the defaults
> (`tiff-webp-v1`, quality 0.8) or replicate that config in your own SW. The
> engine also calls `self.skipWaiting()` and `clients.claim()` on
> install/activate, which will affect your SW's update lifecycle.

## API

From `@tiff-provider/core` (main entry):
`buildTiffUrl`, `decodeTiff`, `decodeWithUtif`, `decodeWithGeotiff`,
`normalizeToRgba`, `encodeWebp`, `isTiffPath`, `shouldIntercept`,
`parseModifiers`, `decideStrategy`.

From `@tiff-provider/core/register` (browser-only `/register` subpath, not the
main entry): `registerTiffServiceWorker`, `detectNativeTiff`.
