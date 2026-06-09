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
 * Throws `'UTIF: no IFDs found'` when the buffer yields no IFDs.
 */
export function decodeWithUtif(buffer: ArrayBuffer): DecodedImage {
  const ifds = UTIF.decode(buffer)
  const page = ifds[0]
  if (!page) throw new Error('UTIF: no IFDs found')
  const bits = page.t258
  // `t258` (BitsPerSample) is optional in the UTIF type and absent on some
  // baseline 8-bit files; absent ⇒ treat as 8-bit. A TIFF that omits the tag
  // yet is actually >8-bit would slip past this guard — out of MVP scope.
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
