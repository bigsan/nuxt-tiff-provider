import { describe, expect, it } from 'vitest'
import {
  cacheKey,
  decideStrategy,
  isTiffPath,
  parseModifiers,
  shouldIntercept,
  stripProviderParams,
} from '../src/router'

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
  it('intercepts any URL carrying the prefix marker', () => {
    expect(shouldIntercept(new URL('https://x.test/a.tif?tp=1'), 'tp')).toBe(true)
  })
  it('intercepts a marked source even without a .tif extension', () => {
    expect(shouldIntercept(new URL('https://b.s3.amazonaws.com/abc123?tp=1'), 'tp')).toBe(true)
  })
  it('ignores a URL without the marker (the raw-bytes fetch)', () => {
    expect(shouldIntercept(new URL('https://x.test/a.tif'), 'tp')).toBe(false)
  })
  it('honors a configurable prefix', () => {
    expect(shouldIntercept(new URL('https://x.test/a.tif?img=1'), 'img')).toBe(true)
    expect(shouldIntercept(new URL('https://x.test/a.tif?tp=1'), 'img')).toBe(false)
  })
})

describe('parseModifiers', () => {
  it('parses namespaced width/height and converts quality from 0..100 to 0..1', () => {
    const m = parseModifiers(new URL('https://x.test/a.tif?tp=1&tp-w=640&tp-h=200&tp-q=70'), 'tp')
    expect(m.targetWidth).toBe(640)
    expect(m.targetHeight).toBe(200)
    expect(m.quality).toBeCloseTo(0.7)
  })
  it('returns undefined fields when params are absent', () => {
    const m = parseModifiers(new URL('https://x.test/a.tif?tp=1'), 'tp')
    expect(m.targetWidth).toBeUndefined()
    expect(m.targetHeight).toBeUndefined()
    expect(m.quality).toBeUndefined()
  })
  it('reads modifiers under a configurable prefix', () => {
    const m = parseModifiers(new URL('https://x.test/a.tif?img=1&img-w=320'), 'img')
    expect(m.targetWidth).toBe(320)
  })
})

describe('stripProviderParams', () => {
  it('removes the marker and namespaced params, leaving a bare URL', () => {
    expect(stripProviderParams(new URL('https://x.test/a.tif?tp=1&tp-w=640&tp-q=70'), 'tp')).toBe(
      'https://x.test/a.tif',
    )
  })
  it('preserves the source query (e.g. a signed URL)', () => {
    expect(
      stripProviderParams(
        new URL('https://b.s3.amazonaws.com/k?X-Amz-Signature=sig&tp=1&tp-w=640'),
        'tp',
      ),
    ).toBe('https://b.s3.amazonaws.com/k?X-Amz-Signature=sig')
  })
  it('honors a configurable prefix', () => {
    expect(stripProviderParams(new URL('https://x.test/a.tif?img=1&img-w=640&keep=1'), 'img')).toBe(
      'https://x.test/a.tif?keep=1',
    )
  })
  it('also strips the namespaced retry buster (it lives under the prefix)', () => {
    expect(
      stripProviderParams(new URL('https://x.test/a.tif?token=1&tp=1&tp-w=640&tp-retry=1'), 'tp'),
    ).toBe('https://x.test/a.tif?token=1')
  })
})

describe('cacheKey', () => {
  it('drops the retry buster so recovered and normal requests share an entry', () => {
    expect(cacheKey(new URL('https://x.test/a.tif?tp=1&tp-w=640&tp-retry=1'), 'tp')).toBe(
      cacheKey(new URL('https://x.test/a.tif?tp=1&tp-w=640'), 'tp'),
    )
  })
  it('keeps size modifiers so different sizes stay distinct', () => {
    expect(cacheKey(new URL('https://x.test/a.tif?tp=1&tp-w=640'), 'tp')).not.toBe(
      cacheKey(new URL('https://x.test/a.tif?tp=1&tp-w=320'), 'tp'),
    )
  })
  it('honors a configurable prefix', () => {
    expect(cacheKey(new URL('https://x.test/a.tif?img=1&img-w=640&img-retry=1'), 'img')).toBe(
      'https://x.test/a.tif?img=1&img-w=640',
    )
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
