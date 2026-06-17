export type Strategy = 'passthrough' | 'cache' | 'transcode'

/** Utility: does this pathname look like a TIFF? (No longer gates interception.) */
export function isTiffPath(pathname: string): boolean {
  return /\.tiff?$/i.test(pathname)
}

/**
 * The SW intercepts only requests tagged with the provider's `prefix` marker.
 * Bare fetches — including the SW's own raw-bytes fetch, which strips the marker —
 * pass through. This makes interception opt-in and extension-independent (a marked
 * source need not end in `.tif`).
 */
export function shouldIntercept(url: URL, prefix: string): boolean {
  return url.searchParams.has(prefix)
}

export function parseModifiers(
  url: URL,
  prefix: string,
): { targetWidth?: number; targetHeight?: number; quality?: number } {
  const w = url.searchParams.get(`${prefix}-w`)
  const h = url.searchParams.get(`${prefix}-h`)
  const q = url.searchParams.get(`${prefix}-q`)
  return {
    targetWidth: w ? Number(w) : undefined,
    targetHeight: h ? Number(h) : undefined,
    quality: q ? Number(q) / 100 : undefined,
  }
}

/**
 * Reconstruct the raw upstream URL for the SW's own fetch: drop the provider's
 * marker and `{prefix}-*` params, but keep everything else (e.g. a signed URL's
 * query) so the origin still receives a valid request.
 */
export function stripProviderParams(url: URL, prefix: string): string {
  const params = new URLSearchParams(url.search)
  for (const key of [...params.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}-`)) params.delete(key)
  }
  const qs = params.toString()
  return url.origin + url.pathname + (qs ? `?${qs}` : '')
}

/**
 * Cache key for a transcode request: drop the recovery cache-buster
 * (`{prefix}-retry`) so a recovered request and a normal one hit the same entry,
 * while keeping size modifiers (`{prefix}-w`/`-h`) that change the output.
 */
export function cacheKey(url: URL, prefix: string): string {
  const u = new URL(url.href)
  u.searchParams.delete(`${prefix}-retry`)
  return u.href
}

export function decideStrategy(o: { nativeTiff: boolean; cacheHit: boolean }): Strategy {
  if (o.nativeTiff) return 'passthrough'
  if (o.cacheHit) return 'cache'
  return 'transcode'
}
