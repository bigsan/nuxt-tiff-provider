import UTIF from 'utif'

export interface DecodedImage {
  width: number
  height: number
  /** RGBA bytes, ArrayBuffer-backed (matches the encoder's `RgbaImage` so the SW can pass a decoded image straight to `encodeWebp` with no copy). */
  rgba: Uint8ClampedArray<ArrayBuffer>
}

/**
 * Decode common 8-bit baseline TIFFs with UTIF (tiny, pure JS).
 * Throws on >8-bit depth so the geotiff fallback handles those.
 */
export function decodeWithUtif(buffer: ArrayBuffer): DecodedImage {
  const ifds = UTIF.decode(buffer)
  const page = ifds[0]
  if (!page) throw new Error('UTIF: no IFDs found')
  const bits = page.t258
  if (bits && Math.max(...bits) > 8) {
    throw new Error('UTIF: bit depth > 8 not supported')
  }
  UTIF.decodeImage(buffer, page)
  const rgba = UTIF.toRGBA8(page)
  return {
    width: page.width,
    height: page.height,
    rgba: new Uint8ClampedArray(rgba),
  }
}
