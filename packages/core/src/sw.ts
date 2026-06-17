/// <reference lib="webworker" />
import { decodeTiff } from './decoder'
import { encodeWebp } from './encoder'
import { cacheKey, parseModifiers, shouldIntercept, stripProviderParams } from './router'

declare const self: ServiceWorkerGlobalScope

// Runtime config from the registration URL query (?cache=...&q=...&prefix=...), so
// the prebuilt artifact never needs rebuilding to be configured.
const swParams = new URL(self.location.href).searchParams
const CACHE_NAME = swParams.get('cache') || 'tiff-webp-v1'
const PREFIX = swParams.get('prefix') || 'tp'
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
  if (!shouldIntercept(url, PREFIX)) return
  event.respondWith(handleTiff(url))
})

async function handleTiff(url: URL): Promise<Response> {
  // Safari renders TIFF natively — skip the transcode entirely.
  if (nativeTiff) return fetch(rawRequest(url))

  const cache = await caches.open(CACHE_NAME)
  // Normalize the cache key so a cold-load retry (which adds {prefix}-retry to
  // bust the browser cache) shares the same entry as a normal request.
  const key = cacheKey(url, PREFIX)
  const cached = await cache.match(key)
  if (cached) return cached

  try {
    const t0 = performance.now()
    const res = await fetch(rawRequest(url))
    if (!res.ok) return res
    const buffer = await res.arrayBuffer()
    const decoded = await decodeTiff(buffer)
    const t1 = performance.now()
    const { targetWidth, targetHeight, quality } = parseModifiers(url, PREFIX)
    const blob = await encodeWebp(decoded, {
      targetWidth,
      targetHeight,
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
    await cache.put(key, response.clone())
    await notifyTimings(url.pathname, t1 - t0, t2 - t1, t2 - t0)
    return response
  } catch (err) {
    console.warn('[tiff-sw] transcode failed, passing through:', err)
    return fetch(rawRequest(url))
  }
}

/**
 * Upstream request for the original bytes: the provider marker and `{prefix}-*`
 * params are stripped (so the SW does not re-intercept its own fetch) while the
 * source's own query is preserved; `cors` mode allows same-origin or
 * CORS-readable cross-origin sources.
 */
function rawRequest(url: URL): Request {
  return new Request(stripProviderParams(url, PREFIX), { mode: 'cors' })
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
