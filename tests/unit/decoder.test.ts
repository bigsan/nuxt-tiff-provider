import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeTiff, decodeWithGeotiff, decodeWithUtif } from '../../service-worker/decoder'

function load(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../fixtures', name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

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
