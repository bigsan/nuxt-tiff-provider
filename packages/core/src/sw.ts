/// <reference lib="webworker" />
import { decodeTiff } from './decoder'
import { encodeWebp } from './encoder'
import { parseModifiers, shouldIntercept } from './router'

declare const self: ServiceWorkerGlobalScope

// Runtime config from the registration URL query (?cache=...&q=...), so the
// prebuilt artifact never needs rebuilding to be configured.
const swParams = new URL(self.location.href).searchParams
const CACHE_NAME = swParams.get('cache') || 'tiff-webp-v1'
const qRaw = swParams.get('q')
const qNum = qRaw === null || qRaw === '' ? NaN : Number(qRaw)
// Fall back to 0.8 for missing/empty/non-numeric/out-of-range q; honor an explicit 0..100.
const DEFAULT_QUALITY = Number.isFinite(qNum) && qNum >= 0 && qNum <= 100 ? qNum / 100 : 0.8

let nativeTiff = false

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
    if (!res.ok) return res
    const buffer = await res.arrayBuffer()
    const decoded = await decodeTiff(buffer)
    const t1 = performance.now()
    const { targetWidth, quality } = parseModifiers(url)
    const blob = await encodeWebp(decoded, {
      targetWidth,
      quality: Number.isFinite(quality) ? quality : DEFAULT_QUALITY,
    })
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
