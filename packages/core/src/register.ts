export interface RegisterOptions {
  /** SW script URL. Default '/tiff-sw.js' (served at root scope). */
  swUrl?: string
  /** Registration scope. Default '/'. */
  scope?: string
  /** Cache API bucket name passed to the SW via ?cache=. */
  cacheName?: string
  /** Default WebP quality 0..1 passed to the SW via ?q=. */
  quality?: number
  /**
   * Re-request TIFF `<img>`s that loaded before the Service Worker controlled
   * the page (a cold visit) and so failed to decode. Default true.
   */
  retryRacedImages?: boolean
}

// A minimal 2x2 baseline TIFF. createImageBitmap() resolves it only where the
// browser decodes TIFF natively (Safari), so a successful decode == native support.
// Regenerate with: node -e "import('utif').then(({default:U})=>{const r=new Uint8Array(16).fill(200);process.stdout.write(Buffer.from(U.encodeImage(r.buffer,2,2)).toString('base64'))})"
const PROBE_TIFF_BASE64 =
  'TU0AKgAAAAgAEQEAAAMAAAABAAIAAAEBAAMAAAABAAIAAAECAAMAAAAEAAAA2gEDAAMAAAABAAEAAAEGAAMAAAABAAIAAAERAAQAAAABAAAD6AEVAAMAAAABAAQAAAEWAAQAAAABAAAAAgEXAAQAAAABAAAAEAEaAAUAAAABAAAA4gEbAAUAAAABAAAA6gEcAAMAAAABAAEAAAEeAAUAAAABAAAA8gEfAAUAAAABAAAA+gEoAAMAAAABAAEAAAExAAIAAAATAAABAgFSAAMAAAABAAEAAAAAAAAACAAIAAgACAAAJxAAACcQAAAnEAAAJxAAAAAAAAAnEAAAAAAAACcQUGhvdG9wZWEgKFVUSUYuanMpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjIyMjIyMjIyMjIyMjIyMg='

/** True only where the browser paints TIFF natively (Safari). */
export async function detectNativeTiff(): Promise<boolean> {
  if (typeof createImageBitmap === 'undefined' || typeof atob === 'undefined') return false
  try {
    const bytes = Uint8Array.from(atob(PROBE_TIFF_BASE64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/tiff' }))
    bitmap.close()
    return true
  } catch {
    return false
  }
}

/** A TIFF-provider request always carries `fmt=` (see buildTiffUrl). */
const TIFF_REQUEST_RE = /[?&]fmt=/

/**
 * Append a cache-busting marker so a retried request bypasses the browser's
 * cached raw-TIFF response and reaches the (now-controlling) Service Worker.
 */
export function withRetryParam(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + '_tiffretry=1'
}

/** Apply {@link withRetryParam} to every candidate URL in a `srcset` value. */
export function withRetrySrcset(srcset: string): string {
  return srcset
    .split(',')
    .map((part) => {
      const seg = part.trim()
      if (!seg) return seg
      const sp = seg.indexOf(' ')
      return sp === -1 ? withRetryParam(seg) : withRetryParam(seg.slice(0, sp)) + seg.slice(sp)
    })
    .join(', ')
}

/**
 * Recover from the cold-visit race: the browser's preload scanner fetches `<img>`
 * TIFF URLs before the SW controls the page, so they load raw bytes and fail to
 * decode (everywhere but Safari, which paints TIFF natively). clients.claim()
 * cannot retroactively intercept those in-flight requests, so re-request any
 * failed TIFF image once the SW is in control — each at most once.
 */
function installRacedImageRecovery(): void {
  if (typeof document === 'undefined') return
  const sw = navigator.serviceWorker

  const retry = (img: HTMLImageElement): void => {
    if (img.dataset.tiffRetried || !TIFF_REQUEST_RE.test(img.currentSrc || img.src)) return
    img.dataset.tiffRetried = '1'
    if (img.srcset) img.srcset = withRetrySrcset(img.srcset)
    img.src = withRetryParam(img.src)
  }

  // Images that fail once the SW already controls the page: retry on the spot.
  // An <img> error does not bubble, so listen in the capture phase.
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target
      if (target instanceof HTMLImageElement && sw.controller) retry(target)
    },
    true,
  )

  // Images that already failed before the SW took control: sweep once it does.
  const sweep = (): void => {
    for (const img of Array.from(document.images)) {
      if (img.complete && img.naturalWidth === 0) retry(img)
    }
  }
  if (sw.controller) sweep()
  else sw.addEventListener('controllerchange', sweep, { once: true })
}

/**
 * Register the prebuilt transcode Service Worker and tell it whether the browser
 * paints TIFF natively (→ passthrough). No-op outside a SW-capable browser.
 */
export async function registerTiffServiceWorker(
  opts: RegisterOptions = {},
): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const { swUrl = '/tiff-sw.js', scope = '/', cacheName, quality, retryRacedImages = true } = opts

  // Install before registering so the capture listener is in place as early as possible.
  if (retryRacedImages) installRacedImageRecovery()

  const params = new URLSearchParams()
  if (cacheName) params.set('cache', cacheName)
  if (typeof quality === 'number') params.set('q', String(Math.round(quality * 100)))
  const qs = params.toString()
  // Use '&' if swUrl already carries a query string (e.g. a versioned '/tiff-sw.js?v=2'); otherwise '?'.
  const sep = swUrl.includes('?') ? '&' : '?'
  const url = qs ? `${swUrl}${sep}${qs}` : swUrl

  const reg = await navigator.serviceWorker.register(url, { scope })

  const nativeTiff = await detectNativeTiff()
  const ready = await navigator.serviceWorker.ready
  ready.active?.postMessage({ type: 'NATIVE_TIFF', value: nativeTiff })
  return reg
}
