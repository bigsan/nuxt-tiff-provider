/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { decodeTiff } from './decoder'
import { encodeWebp } from './encoder'
import { parseModifiers, shouldIntercept } from './router'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] }

const CACHE_NAME = 'tiff-webp-v1'
let nativeTiff = false

// Required by injectManifest: consumes the precache manifest Vite injects.
precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'NATIVE_TIFF') {
    nativeTiff = Boolean(event.data.value)
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!shouldIntercept(url)) return
  event.respondWith(handleTiff(event.request, url))
})

async function handleTiff(request: Request, url: URL): Promise<Response> {
  // Safari renders TIFF natively — skip the transcode entirely.
  if (nativeTiff) return fetch(rawRequest(url))

  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const t0 = performance.now()
    const res = await fetch(rawRequest(url))
    const buffer = await res.arrayBuffer()
    const decoded = await decodeTiff(buffer)
    const t1 = performance.now()
    const { targetWidth, quality } = parseModifiers(url)
    const blob = await encodeWebp(decoded, { targetWidth, quality })
    const t2 = performance.now()

    const response = new Response(blob, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'no-cache',
        'X-Tiff-Transcoded': '1',
      },
    })
    await cache.put(request, response.clone())
    await notifyTimings(url.pathname, t1 - t0, t2 - t1, t2 - t0)
    return response
  } catch (err) {
    console.warn('[tiff-sw] transcode failed, passing through:', err)
    return fetch(rawRequest(url))
  }
}

/** Bare-pathname request (no query) so the SW does not re-intercept its own fetch. */
function rawRequest(url: URL): Request {
  return new Request(url.origin + url.pathname, { mode: 'same-origin' })
}

async function notifyTimings(
  pathname: string,
  decode: number,
  encode: number,
  total: number,
): Promise<void> {
  const clients = await self.clients.matchAll()
  for (const client of clients) {
    client.postMessage({ type: 'TIFF_TIMING', url: pathname, decode, encode, total })
  }
}
