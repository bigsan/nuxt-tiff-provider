import { joinURL } from 'ufo'
import type { ProviderGetImage } from '@nuxt/image'

const KEY_MAP: Record<string, string> = { format: 'fmt', width: 'w', height: 'h', quality: 'q' }
const KEY_ORDER = ['format', 'width', 'height', 'quality']

/**
 * Pure, isomorphic URL builder. Encodes NuxtImg modifiers into the TIFF URL's
 * query string. `fmt` defaults to `webp`; the `fmt` param is the SW's
 * interception signal.
 */
export function buildTiffUrl(
  src: string,
  modifiers: Record<string, unknown> = {},
  baseURL = '',
): string {
  const merged: Record<string, unknown> = { format: 'webp', ...modifiers }
  const params = new URLSearchParams()
  const keys = [...KEY_ORDER, ...Object.keys(merged).filter((k) => !KEY_ORDER.includes(k))]
  for (const key of keys) {
    const value = merged[key]
    if (value === undefined || value === null || value === '') continue
    params.set(KEY_MAP[key] ?? key, String(value))
  }
  const qs = params.toString()
  return joinURL(baseURL, src) + (qs ? `?${qs}` : '')
}

export const getImage: ProviderGetImage = (src, ctx = {}) => {
  const { modifiers = {}, baseURL = '' } = ctx as {
    modifiers?: Record<string, unknown>
    baseURL?: string
  }
  return { url: buildTiffUrl(src, modifiers, baseURL) }
}
