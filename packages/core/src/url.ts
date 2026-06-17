import { joinURL, withQuery } from 'ufo'

const DEFAULT_PREFIX = 'tp'
const SHORT_KEY: Record<string, string> = { width: 'w', height: 'h', quality: 'q' }
const KEY_ORDER = ['width', 'height', 'quality']

/**
 * Pure, isomorphic URL builder. Encodes image modifiers into the TIFF URL's
 * query string under a namespaced `prefix`, merging into any existing query and
 * preserving the hash. `{prefix}=1` is the Service Worker's interception signal.
 * Output is always WebP, so a `format` modifier is accepted but ignored.
 */
export function buildTiffUrl(
  src: string,
  modifiers: Record<string, unknown> = {},
  baseURL = '',
  opts: { prefix?: string } = {},
): string {
  const prefix = opts.prefix || DEFAULT_PREFIX
  const query: Record<string, string> = { [prefix]: '1' }
  for (const key of KEY_ORDER) {
    const value = modifiers[key]
    if (value === undefined || value === null || value === '') continue
    query[`${prefix}-${SHORT_KEY[key]}`] = String(value)
  }
  return withQuery(baseURL ? joinURL(baseURL, src) : src, query)
}
