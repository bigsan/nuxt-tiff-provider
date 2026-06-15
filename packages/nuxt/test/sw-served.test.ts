import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('nuxt-tiff-provider integration', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixture', import.meta.url)),
    build: true,
    browser: false,
  })

  it('serves the prebuilt Service Worker at /tiff-sw.js', async () => {
    const sw = await $fetch<string>('/tiff-sw.js')
    expect(typeof sw).toBe('string')
    expect(sw).not.toMatch(/\bimport\s*[*{]/) // still a classic script when served
    expect(sw.length).toBeGreaterThan(50_000)
  })
})
