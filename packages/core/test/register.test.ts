import { describe, expect, it } from 'vitest'
import { withRetryParam, withRetrySrcset } from '../src/register'

describe('withRetryParam', () => {
  it('appends the marker with ? when the url has no query', () => {
    expect(withRetryParam('/a.tif')).toBe('/a.tif?_tiffretry=1')
  })

  it('appends the marker with & when the url already has a query', () => {
    expect(withRetryParam('/a.tif?fmt=webp&w=640')).toBe('/a.tif?fmt=webp&w=640&_tiffretry=1')
  })
})

describe('withRetrySrcset', () => {
  it('busts every candidate and preserves width descriptors', () => {
    expect(withRetrySrcset('/a.tif?fmt=webp&w=320 320w, /a.tif?fmt=webp&w=640 640w')).toBe(
      '/a.tif?fmt=webp&w=320&_tiffretry=1 320w, /a.tif?fmt=webp&w=640&_tiffretry=1 640w',
    )
  })

  it('handles a single candidate with no descriptor', () => {
    expect(withRetrySrcset('/a.tif?fmt=webp')).toBe('/a.tif?fmt=webp&_tiffretry=1')
  })
})
