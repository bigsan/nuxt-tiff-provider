import { describe, expect, it } from 'vitest'
import { isTiffProviderRequest, withRetryParam, withRetrySrcset } from '../src/register'

describe('withRetryParam', () => {
  it('appends the marker with ? when the url has no query', () => {
    expect(withRetryParam('/a.tif')).toBe('/a.tif?_tiffretry=1')
  })

  it('appends the marker with & when the url already has a query', () => {
    expect(withRetryParam('/a.tif?tp=1&tp-w=640')).toBe('/a.tif?tp=1&tp-w=640&_tiffretry=1')
  })
})

describe('withRetrySrcset', () => {
  it('busts every candidate and preserves width descriptors', () => {
    expect(withRetrySrcset('/a.tif?tp=1&tp-w=320 320w, /a.tif?tp=1&tp-w=640 640w')).toBe(
      '/a.tif?tp=1&tp-w=320&_tiffretry=1 320w, /a.tif?tp=1&tp-w=640&_tiffretry=1 640w',
    )
  })

  it('handles a single candidate with no descriptor', () => {
    expect(withRetrySrcset('/a.tif?tp=1')).toBe('/a.tif?tp=1&_tiffretry=1')
  })
})

describe('isTiffProviderRequest', () => {
  it('matches a URL carrying the prefix marker', () => {
    expect(isTiffProviderRequest('/a.tif?tp=1&tp-w=640', 'tp')).toBe(true)
  })
  it('does not match a bare URL', () => {
    expect(isTiffProviderRequest('/a.tif', 'tp')).toBe(false)
  })
  it('does not false-match the prefix as a substring of another key', () => {
    expect(isTiffProviderRequest('/a.tif?tpx=1', 'tp')).toBe(false)
  })
  it('honors a configurable prefix', () => {
    expect(isTiffProviderRequest('/a.tif?img=1', 'img')).toBe(true)
  })
})
