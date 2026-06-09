import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeWithUtif } from '../../service-worker/decoder'

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
    expect(() => decodeWithUtif(load('gray16.tif'))).toThrow()
  })
})
