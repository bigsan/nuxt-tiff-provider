import { buildTiffUrl } from '@tiff-provider/core/url'
import type { ProviderGetImage } from '@nuxt/image'

export const getImage: ProviderGetImage = (src, ctx = {}) => {
  const { modifiers = {}, baseURL = '' } = ctx as {
    modifiers?: Record<string, unknown>
    baseURL?: string
  }
  return { url: buildTiffUrl(src, modifiers, baseURL) }
}
