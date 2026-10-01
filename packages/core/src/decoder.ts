import UTIF from 'utif2'
import { fromArrayBuffer } from 'geotiff'
// Side effect: statically register geotiff's raw codec so the 16-bit fallback
// decodes inside a Service Worker, where geotiff's lazy `import()` is forbidden.
import './geotiff-decoders'

export interface DecodedImage {
  width: number
  height: number
  /** RGBA bytes, ArrayBuffer-backed (matches the encoder's `RgbaImage` so the SW can pass a decoded image straight to `encodeWebp` with no copy). */
  rgba: Uint8ClampedArray<ArrayBuffer>
}

/**
 * Decode common bilevel / 8-bit TIFFs with utif2 (pure JS).
 * Throws on >8-bit depth so the geotiff fallback handles those.
 * Throws `'UTIF: no IFDs found'` when the buffer yields no IFDs.
 */
export function decodeWithUtif(buffer: ArrayBuffer): DecodedImage {
  const ifds = UTIF.decode(buffer)
  // Narrows `ifds[0]` from `IFD | undefined` to `IFD` (noUncheckedIndexedAccess)
  // and defends UTIF's `IFD[]` contract; UTIF returns >=1 IFD in practice.
  const page = ifds[0]
  if (!page) throw new Error('UTIF: no IFDs found')
  const bits = page.t258 as number[] | undefined
  // BitsPerSample is optional (defaults to 1); utif2 also tolerates missing
  // photometric metadata on bilevel drawings.
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

/**
 * Normalize interleaved raster bands to RGBA. Handles 1 (gray), 3 (RGB), and
 * 4 (RGBA) samples-per-pixel, scaling 16-bit samples down to 8-bit.
 */
export function normalizeToRgba(
  data: ArrayLike<number>,
  width: number,
  height: number,
  samples: number,
  is16: boolean,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const scale = is16 ? 1 / 257 : 1
  const pixels = width * height
  for (let i = 0, p = 0; i < pixels; i++, p += 4) {
    const base = i * samples
    if (samples === 1) {
      const v = data[base]! * scale
      out[p] = v
      out[p + 1] = v
      out[p + 2] = v
      out[p + 3] = 255
    } else if (samples === 3) {
      out[p] = data[base]! * scale
      out[p + 1] = data[base + 1]! * scale
      out[p + 2] = data[base + 2]! * scale
      out[p + 3] = 255
    } else {
      out[p] = data[base]! * scale
      out[p + 1] = data[base + 1]! * scale
      out[p + 2] = data[base + 2]! * scale
      out[p + 3] = data[base + 3]! * scale
    }
  }
  return out
}

/**
 * Fallback decoder for 16-bit / tiled / COG / exotic-compression TIFFs.
 * Reads the first image only; multi-image TIFFs (overview pyramids, band
 * stacks) are out of MVP scope.
 */
export async function decodeWithGeotiff(buffer: ArrayBuffer): Promise<DecodedImage> {
  const tiff = await fromArrayBuffer(buffer)
  const image = await tiff.getImage()
  const width = image.getWidth()
  const height = image.getHeight()
  const samples = image.getSamplesPerPixel()
  const bps = image.getBitsPerSample()
  const maxBps = Array.isArray(bps) ? Math.max(...bps) : (bps ?? 8)
  const is16 = maxBps > 8
  const raster = await image.readRasters({ interleave: true })
  // `interleave: true` always yields a single interleaved TypedArray; a band
  // array means a misconfiguration, so fail fast rather than emit garbage pixels.
  if (Array.isArray(raster)) {
    throw new Error('geotiff: expected interleaved raster, got band array')
  }
  const rgba = normalizeToRgba(
    raster as unknown as ArrayLike<number>,
    width,
    height,
    samples,
    is16,
  )
  return { width, height, rgba }
}

/** Decode any TIFF: UTIF first (fast, common 8-bit), geotiff fallback otherwise. */
export async function decodeTiff(buffer: ArrayBuffer): Promise<DecodedImage> {
  try {
    return decodeWithUtif(buffer)
  } catch {
    return decodeWithGeotiff(buffer)
  }
}
