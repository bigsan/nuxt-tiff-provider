# @tiff-provider/core

Framework-agnostic in-browser TIFF→WebP transcoder. Ships the decode/encode
logic and a **prebuilt classic Service Worker** (`tiff-sw.js`) with `utif2` +
`geotiff` (all codecs) inlined. For Nuxt, use `nuxt-tiff-provider` instead.

## Register the Service Worker

Copy `node_modules/@tiff-provider/core/dist/tiff-sw.js` to your site's public
root (or serve it via your build tool's static-asset mechanism) so it's
reachable at `/tiff-sw.js`, then:

```ts
import { registerTiffServiceWorker } from '@tiff-provider/core/register'

// Serve dist/tiff-sw.js at your site root, then:
registerTiffServiceWorker({ scope: '/', cacheName: 'tiff-webp-v1', quality: 0.8 })
// paramPrefix defaults to 'tp'; override (e.g. { paramPrefix: 'img' }) only to
// avoid colliding with query params your sources already carry.
```

## Build a provider URL

Modifiers are namespaced under `paramPrefix` (default `tp`); `tp=1` is the
interception marker. Provider params merge into any existing query and the source
hash is preserved, so signed / query-carrying URLs stay valid.

```ts
import { buildTiffUrl } from '@tiff-provider/core/url'
buildTiffUrl('/photo.tif', { width: 640 })        // → /photo.tif?tp=1&tp-w=640
buildTiffUrl('/p.tif?token=abc', { height: 480 }) // → /p.tif?token=abc&tp=1&tp-h=480
```

## Compose into an existing Service Worker

The same artifact works via `importScripts('/tiff-sw.js')` inside your own SW.

> Caveats for this path: the engine reads its `?cache=` / `?q=` / `?prefix=` config from the
> **top-level** service worker's URL, so options passed on the
> `importScripts('/tiff-sw.js?...')` URL are NOT read — rely on the defaults
> (`tiff-webp-v1`, quality 0.8) or replicate that config in your own SW. The
> engine also calls `self.skipWaiting()` and `clients.claim()` on
> install/activate, which will affect your SW's update lifecycle.

## API

From `@tiff-provider/core` (main entry):
`buildTiffUrl`, `decodeTiff`, `decodeWithUtif`, `decodeWithGeotiff`,
`normalizeToRgba`, `encodeWebp`, `fitDimensions`, `isTiffPath`,
`shouldIntercept`, `parseModifiers`, `stripProviderParams`, `decideStrategy`.

From `@tiff-provider/core/register` (browser-only `/register` subpath, not the
main entry): `registerTiffServiceWorker`, `detectNativeTiff`,
`isTiffProviderRequest`.
