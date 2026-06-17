import { buildTiffUrl } from '@tiff-provider/core/url'
import type { ProviderGetImage } from '@nuxt/image'

export const getImage: ProviderGetImage = (src, options = {}) => {
  const {
    modifiers = {},
    baseURL = '',
    paramPrefix,
  } = options as {
    modifiers?: Record<string, unknown>
    baseURL?: string
    paramPrefix?: string
  }
  return { url: buildTiffUrl(src, modifiers, baseURL, { prefix: paramPrefix }) }
}
