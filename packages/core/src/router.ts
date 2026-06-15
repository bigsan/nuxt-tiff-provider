export type Strategy = 'passthrough' | 'cache' | 'transcode'

export function isTiffPath(pathname: string): boolean {
  return /\.tiff?$/i.test(pathname)
}

/** The SW only handles tiff requests tagged with `fmt`; bare-path fetches pass through. */
export function shouldIntercept(url: URL): boolean {
  return isTiffPath(url.pathname) && url.searchParams.has('fmt')
}

export function parseModifiers(url: URL): { targetWidth?: number; quality?: number } {
  const w = url.searchParams.get('w')
  const q = url.searchParams.get('q')
  return {
    targetWidth: w ? Number(w) : undefined,
    quality: q ? Number(q) / 100 : undefined,
  }
}

export function decideStrategy(o: { nativeTiff: boolean; cacheHit: boolean }): Strategy {
  if (o.nativeTiff) return 'passthrough'
  if (o.cacheHit) return 'cache'
  return 'transcode'
}
