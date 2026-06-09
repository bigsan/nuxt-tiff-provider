import { describe, expect, it } from 'vitest'
import type { ImageCTX } from '@nuxt/image'
import { buildTiffUrl, getImage } from '../../app/providers/tiff'

describe('buildTiffUrl', () => {
  it('defaults the format to webp', () => {
    expect(buildTiffUrl('/a.tif')).toBe('/a.tif?fmt=webp')
  })

  it('maps width and quality to short keys in declared order', () => {
    expect(buildTiffUrl('/a.tif', { width: 640, quality: 70 })).toBe('/a.tif?fmt=webp&w=640&q=70')
  })

  it('prepends the baseURL', () => {
    expect(buildTiffUrl('/a.tif', { width: 100 }, 'https://cdn.test')).toBe(
      'https://cdn.test/a.tif?fmt=webp&w=100',
    )
  })

  it('skips empty/undefined modifiers', () => {
    expect(buildTiffUrl('/a.tif', { width: undefined, height: '' })).toBe('/a.tif?fmt=webp')
  })
})

describe('getImage', () => {
  it('returns a { url } object built from the modifiers context', () => {
    expect(getImage('/a.tif', { modifiers: { width: 320 } }, {} as ImageCTX)).toEqual({ url: '/a.tif?fmt=webp&w=320' })
  })
})
