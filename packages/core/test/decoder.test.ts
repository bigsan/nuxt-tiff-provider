import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeTiff, decodeWithGeotiff, decodeWithUtif } from '../src/decoder'

function load(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, './fixtures', name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// Original, unmodified CCITT Group 4 drawing (3338 bytes):
// https://impat.webpat.co/v1/ipfs/drw/twb_I406387_097107333_B1/0/1
// SHA256: e27a257cfab7f943cd38a173c9df53196c91b5910e197e20135b08cb6e38633d
const DRAWING = 'group4-missing-photometric.tif'

describe('Group 4 regression', () => {
  it.each([
    ['decodeWithUtif', decodeWithUtif],
    ['decodeTiff', decodeTiff],
  ])('%s decodes a drawing with missing photometric metadata', async (_, decode) => {
    const { width, height, rgba } = await decode(load(DRAWING))
    expect(width).toBe(1395)
    expect(height).toBe(1044)
    expect(rgba).toHaveLength(width * height * 4)

    // Check known background and ink pixels to catch black output or inversion.
    const samples = [
      { x: 0, y: 0, expected: [255, 255, 255, 255] },
      { x: 231, y: 67, expected: [0, 0, 0, 255] },
    ]
    for (const { x, y, expected } of samples) {
      const offset = (y * width + x) * 4
      expect(Array.from(rgba.slice(offset, offset + 4)), `pixel (${x}, ${y})`).toEqual(expected)
    }
  })
})

describe('CMYK regression', () => {
  // utif2's CMYK branch reads the bare global `window`, which is missing in a
  // Service Worker and in this node environment alike. Unguarded it throws, and
  // the geotiff fallback then misreads the four inks as RGBA — K becomes alpha.
  it.each([
    ['decodeWithUtif', decodeWithUtif],
    ['decodeTiff', decodeTiff],
  ])('%s decodes CMYK to opaque RGB where there is no window', async (_, decode) => {
    expect('window' in globalThis).toBe(false)
    const { width, height, rgba } = await decode(load('cmyk8.tif'))
    expect(width).toBe(256)
    expect(height).toBe(192)
    expect(rgba).toHaveLength(width * height * 4)

    // 20% black everywhere; cyan ramps left→right, magenta top→bottom.
    const samples = [
      { x: 0, y: 0, expected: [204, 204, 204, 255] },
      { x: 255, y: 0, expected: [1, 204, 204, 255] },
      { x: 0, y: 191, expected: [204, 1, 204, 255] },
    ]
    for (const { x, y, expected } of samples) {
      const offset = (y * width + x) * 4
      expect(Array.from(rgba.slice(offset, offset + 4)), `pixel (${x}, ${y})`).toEqual(expected)
    }
    // Every pixel is opaque bar the very last: utif (3.1.0 and utif2 alike) reads
    // one sample past the end of a four-ink image and leaves that alpha at 0.
    let translucent = 0
    for (let i = 3; i < rgba.length - 4; i += 4) if (rgba[i] !== 255) translucent++
    expect(translucent).toBe(0)

    // The decoder only lends utif2 a `window` for the call; it must not leak.
    expect('window' in globalThis).toBe(false)
  })
})

describe('decodeWithUtif', () => {
  it('decodes an 8-bit RGB TIFF to RGBA', () => {
    const out = decodeWithUtif(load('rgb8.tif'))
    expect(out.width).toBe(512)
    expect(out.height).toBe(384)
    expect(out.rgba.length).toBe(512 * 384 * 4)
  })

  it('throws on >8-bit input so the fallback can take over', () => {
    expect(() => decodeWithUtif(load('gray16.tif'))).toThrow('UTIF: bit depth > 8 not supported')
  })
})

describe('decodeWithGeotiff', () => {
  it('decodes a 16-bit gray TIFF to RGBA with alpha filled', async () => {
    const out = await decodeWithGeotiff(load('gray16.tif'))
    expect(out.width).toBe(512)
    expect(out.height).toBe(384)
    expect(out.rgba.length).toBe(512 * 384 * 4)
    expect(out.rgba[3]).toBe(255)
  })
})

describe('decodeTiff', () => {
  it('routes a 16-bit TIFF to the geotiff fallback automatically', async () => {
    const out = await decodeTiff(load('gray16.tif'))
    expect(out.width).toBe(512)
    expect(out.height).toBe(384)
    expect(out.rgba.length).toBe(512 * 384 * 4)
  })
})
