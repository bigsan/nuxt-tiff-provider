export interface RegisterOptions {
  /** SW script URL. Default '/tiff-sw.js' (served at root scope). */
  swUrl?: string
  /** Registration scope. Default '/'. */
  scope?: string
  /** Cache API bucket name passed to the SW via ?cache=. */
  cacheName?: string
  /** Default WebP quality 0..1 passed to the SW via ?q=. */
  quality?: number
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

/**
 * Register the prebuilt transcode Service Worker and tell it whether the browser
 * paints TIFF natively (→ passthrough). No-op outside a SW-capable browser.
 */
export async function registerTiffServiceWorker(
  opts: RegisterOptions = {},
): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const { swUrl = '/tiff-sw.js', scope = '/', cacheName, quality } = opts

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
