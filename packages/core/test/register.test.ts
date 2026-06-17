import { describe, expect, it } from 'vitest'
import { isTiffProviderRequest, withRetryParam, withRetrySrcset } from '../src/register'

describe('withRetryParam', () => {
  it('appends the namespaced retry marker with ? when the url has no query', () => {
    expect(withRetryParam('/a.tif', 'tp')).toBe('/a.tif?tp-retry=1')
  })

  it('appends the retry marker with & when the url already has a query', () => {
    expect(withRetryParam('/a.tif?tp=1&tp-w=640', 'tp')).toBe('/a.tif?tp=1&tp-w=640&tp-retry=1')
  })

  it('honors a configurable prefix', () => {
    expect(withRetryParam('/a.tif?img=1', 'img')).toBe('/a.tif?img=1&img-retry=1')
  })
})

describe('withRetrySrcset', () => {
  it('busts every candidate and preserves width descriptors', () => {
    expect(withRetrySrcset('/a.tif?tp=1&tp-w=320 320w, /a.tif?tp=1&tp-w=640 640w', 'tp')).toBe(
      '/a.tif?tp=1&tp-w=320&tp-retry=1 320w, /a.tif?tp=1&tp-w=640&tp-retry=1 640w',
    )
  })

  it('handles a single candidate with no descriptor', () => {
    expect(withRetrySrcset('/a.tif?tp=1', 'tp')).toBe('/a.tif?tp=1&tp-retry=1')
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
