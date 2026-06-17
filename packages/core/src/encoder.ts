export interface RgbaImage {
  width: number
  height: number
  /** RGBA bytes. Must be ArrayBuffer-backed (the natural result of `new Uint8ClampedArray(len)` or a decoder allocation) so it can construct an `ImageData` without a copy. */
  rgba: Uint8ClampedArray<ArrayBuffer>
}

export interface EncodeOptions {
  /** Downscale target width in px; ignored if >= source width. */
  targetWidth?: number
  /** Downscale target height in px; ignored if >= source height. */
  targetHeight?: number
  /** WebP quality 0..1. */
  quality?: number
}

/**
 * Compute output dimensions: scale the source down to fit inside the
 * `targetWidth`×`targetHeight` box with aspect ratio preserved and never
 * upscaled. Either bound may be omitted; with neither, the source size is kept.
 * Each axis is clamped to a minimum of 1px.
 */
export function fitDimensions(
  srcWidth: number,
  srcHeight: number,
  targetWidth?: number,
  targetHeight?: number,
): { width: number; height: number } {
  let scale = 1
  if (targetWidth && targetWidth > 0) scale = Math.min(scale, targetWidth / srcWidth)
  if (targetHeight && targetHeight > 0) scale = Math.min(scale, targetHeight / srcHeight)
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  }
}

/**
 * Encode RGBA pixels to a WebP Blob off the main thread, downscaling to fit the
 * requested width/height box (aspect preserved). Runs in the SW/Worker scope.
 */
export async function encodeWebp(image: RgbaImage, opts: EncodeOptions = {}): Promise<Blob> {
  const { width, height, rgba } = image
  const { width: targetWidth, height: targetHeight } = fitDimensions(
    width,
    height,
    opts.targetWidth,
    opts.targetHeight,
  )

  const source = new ImageData(rgba, width, height)
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
