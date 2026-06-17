import { describe, expect, it } from 'vitest'
import type { ImageCTX } from '@nuxt/image'
import { getImage } from '../src/runtime/provider'

describe('getImage', () => {
  it('builds a { url } from modifiers, namespaced under the default prefix', () => {
    expect(getImage('/a.tif', { modifiers: { width: 320 } }, {} as ImageCTX)).toEqual({
      url: '/a.tif?tp=1&tp-w=320',
    })
  })

  it('honors a paramPrefix supplied via provider options', () => {
    expect(
      getImage('/a.tif', { modifiers: { width: 320 }, paramPrefix: 'img' }, {} as ImageCTX),
    ).toEqual({ url: '/a.tif?img=1&img-w=320' })
  })
})
