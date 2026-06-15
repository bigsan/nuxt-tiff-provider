import { describe, expect, it } from 'vitest'
import type { ImageCTX } from '@nuxt/image'
import { getImage } from '../src/runtime/provider'

describe('getImage', () => {
  it('returns a { url } object built from the modifiers context', () => {
    expect(getImage('/a.tif', { modifiers: { width: 320 } }, {} as ImageCTX)).toEqual({
      url: '/a.tif?fmt=webp&w=320',
    })
  })
})
