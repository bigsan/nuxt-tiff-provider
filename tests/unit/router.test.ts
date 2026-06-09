import { describe, expect, it } from 'vitest'
import { decideStrategy, isTiffPath, parseModifiers, shouldIntercept } from '../../service-worker/router'

describe('isTiffPath', () => {
  it('matches .tif and .tiff case-insensitively', () => {
    expect(isTiffPath('/a/b.tif')).toBe(true)
    expect(isTiffPath('/a/b.TIFF')).toBe(true)
  })
  it('rejects non-tiff paths', () => {
    expect(isTiffPath('/a/b.png')).toBe(false)
  })
})

describe('shouldIntercept', () => {
  it('intercepts a tiff URL carrying fmt', () => {
    expect(shouldIntercept(new URL('https://x.test/a.tif?fmt=webp'))).toBe(true)
  })
  it('ignores a tiff URL without fmt (the raw-bytes fetch)', () => {
    expect(shouldIntercept(new URL('https://x.test/a.tif'))).toBe(false)
  })
  it('ignores a non-tiff URL even with fmt', () => {
    expect(shouldIntercept(new URL('https://x.test/a.png?fmt=webp'))).toBe(false)
  })
})

describe('parseModifiers', () => {
  it('parses width and converts quality from 0..100 to 0..1', () => {
    const m = parseModifiers(new URL('https://x.test/a.tif?fmt=webp&w=640&q=70'))
    expect(m.targetWidth).toBe(640)
    expect(m.quality).toBeCloseTo(0.7)
  })
  it('returns undefined fields when params are absent', () => {
    const m = parseModifiers(new URL('https://x.test/a.tif?fmt=webp'))
    expect(m.targetWidth).toBeUndefined()
    expect(m.quality).toBeUndefined()
  })
})

describe('decideStrategy', () => {
  it('passthrough when native tiff is available', () => {
    expect(decideStrategy({ nativeTiff: true, cacheHit: false })).toBe('passthrough')
  })
  it('cache when there is a hit and not native', () => {
    expect(decideStrategy({ nativeTiff: false, cacheHit: true })).toBe('cache')
  })
  it('transcode otherwise', () => {
    expect(decideStrategy({ nativeTiff: false, cacheHit: false })).toBe('transcode')
  })
})
