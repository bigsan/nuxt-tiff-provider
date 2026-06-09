export interface RgbaImage {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export interface EncodeOptions {
  /** Downscale target width in px; ignored if >= source width. */
  targetWidth?: number
  /** WebP quality 0..1. */
  quality?: number
}

/**
 * Encode RGBA pixels to a WebP Blob off the main thread, optionally downscaling
 * to `targetWidth` (aspect preserved). Runs in the SW/Worker scope.
 */
export async function encodeWebp(image: RgbaImage, opts: EncodeOptions = {}): Promise<Blob> {
  const { width, height, rgba } = image
  const targetWidth =
    opts.targetWidth && opts.targetWidth > 0 && opts.targetWidth < width ? opts.targetWidth : width
  const targetHeight = Math.max(1, Math.round((targetWidth / width) * height))

  const source = new ImageData(new Uint8ClampedArray(rgba), width, height)
  const bitmap = await createImageBitmap(source)
  try {
    const canvas = new OffscreenCanvas(targetWidth, targetHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable')
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    return await canvas.convertToBlob({ type: 'image/webp', quality: opts.quality ?? 0.8 })
  } finally {
    bitmap.close()
  }
}
