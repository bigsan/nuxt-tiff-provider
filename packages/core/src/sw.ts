/// <reference lib="webworker" />
import { decodeTiff } from './decoder'
import { encodeWebp } from './encoder'
import { shouldIntercept } from './router'
import { createTiffHandler } from './sw-handler'

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

const handleTiff = createTiffHandler({
  prefix: PREFIX,
  defaultQuality: DEFAULT_QUALITY,
  isNative: () => nativeTiff,
  fetch: (request) => fetch(request),
  openCache: () => caches.open(CACHE_NAME),
  decode: decodeTiff,
  encode: encodeWebp,
  notify: notifyTimings,
  now: () => performance.now(),
  yieldToEventLoop: () => new Promise((resolve) => setTimeout(resolve, 0)),
  warn: (message, err) => console.warn(message, err),
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!shouldIntercept(url, PREFIX)) return
  event.respondWith(handleTiff(url, event.request.signal, (p) => event.waitUntil(p)))
})

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
