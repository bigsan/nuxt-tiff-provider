import { describe, expect, it } from 'vitest'
import { buildTiffUrl } from '../src/url'

describe('buildTiffUrl', () => {
  it('emits only the interception marker when no modifiers are given', () => {
    expect(buildTiffUrl('/a.tif')).toBe('/a.tif?tp=1')
  })

  it('namespaces width and quality under the prefix in declared order', () => {
    expect(buildTiffUrl('/a.tif', { width: 640, quality: 70 })).toBe('/a.tif?tp=1&tp-w=640&tp-q=70')
  })

  it('namespaces a height value', () => {
    expect(buildTiffUrl('/a.tif', { height: 200 })).toBe('/a.tif?tp=1&tp-h=200')
  })

  it('prepends the baseURL', () => {
    expect(buildTiffUrl('/a.tif', { width: 100 }, 'https://cdn.test')).toBe(
      'https://cdn.test/a.tif?tp=1&tp-w=100',
    )
  })

  it('skips empty/undefined modifiers', () => {
    expect(buildTiffUrl('/a.tif', { width: undefined, height: '' })).toBe('/a.tif?tp=1')
  })

  it('ignores the format modifier (webp-only)', () => {
    expect(buildTiffUrl('/a.tif', { format: 'jpeg' })).toBe('/a.tif?tp=1')
  })

  it('merges into an existing query string instead of appending a second "?"', () => {
    expect(buildTiffUrl('/a.tif?token=1', { width: 640 })).toBe('/a.tif?token=1&tp=1&tp-w=640')
  })

  it('preserves a hash fragment', () => {
    expect(buildTiffUrl('/a.tif#sec', { width: 640 })).toBe('/a.tif?tp=1&tp-w=640#sec')
  })

  it('preserves both an existing query and a hash', () => {
    expect(buildTiffUrl('/a.tif?token=1#sec', { width: 640 })).toBe(
      '/a.tif?token=1&tp=1&tp-w=640#sec',
    )
  })

  it('honors a configurable prefix', () => {
    expect(buildTiffUrl('/a.tif', { width: 640 }, '', { prefix: 'img' })).toBe(
      '/a.tif?img=1&img-w=640',
    )
  })
})
