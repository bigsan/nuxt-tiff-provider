import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

describe('nuxt-tiff-provider integration', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixture', import.meta.url)),
    build: true,
    browser: false,
    setupTimeout: 300_000,
  })

  it('serves the prebuilt classic Service Worker at /tiff-sw.js, uncached', async () => {
    const res = await fetch('/tiff-sw.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control') ?? '').toContain('no-cache')

    const sw = await res.text()
    expect(sw).not.toMatch(/\bimport\s*[*{]/) // classic: no ES module import
    expect(sw).not.toMatch(/\bexport\s/) // classic: no ES module export
    expect(sw).toMatch(/addEventListener/) // it really is the SW
    expect(sw.length).toBeGreaterThan(50_000) // codecs inlined
  })
})
