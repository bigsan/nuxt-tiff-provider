import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  addPlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  installModule,
} from '@nuxt/kit'
import { defu } from 'defu'

export interface ModuleOptions {
  /** Provider name used as <NuxtImg provider="..."> Default 'tiff'. */
  providerName: string
  /** Cache API bucket name. Default 'tiff-webp-v1'. */
  cacheName: string
  /** Default WebP quality 0..1. Default 0.8. */
  quality: number
  /** SW registration scope. Default '/'. */
  scope: string
  /** Auto-register the SW from a client plugin. Default true. */
  autoRegister: boolean
  /** Re-request TIFF images that raced the SW on a cold load. Default true. */
  retryRacedImages: boolean
}

const module = defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-tiff-provider',
    configKey: 'tiff',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    providerName: 'tiff',
    cacheName: 'tiff-webp-v1',
    quality: 0.8,
    scope: '/',
    autoRegister: true,
    retryRacedImages: true,
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // 1. Register the @nuxt/image provider BEFORE @nuxt/image resolves providers.
    // `image` is added to NuxtOptions by @nuxt/image at runtime; cast to access it.
    ;(nuxt.options as unknown as Record<string, unknown>).image = defu(
      (nuxt.options as unknown as Record<string, unknown>).image || {},
      {
        providers: {
          [options.providerName]: {
            name: options.providerName,
            provider: resolver.resolve('./runtime/provider'),
          },
        },
      },
    )

    // 2. Own the @nuxt/image dependency so provider registration is order-independent.
    //    If the consumer also lists @nuxt/image, it MUST come after this module.
    if (!hasNuxtModule('@nuxt/image')) {
      await installModule('@nuxt/image')
    }

    // 3. Copy the prebuilt classic SW into a stable dir and serve it at root scope
    //    (root scope needs no Service-Worker-Allowed header).
    const require = createRequire(import.meta.url)
    let swSource: string
    try {
      swSource = require.resolve('@tiff-provider/core/tiff-sw.js')
    } catch {
      throw new Error(
        'nuxt-tiff-provider: could not resolve "@tiff-provider/core/tiff-sw.js". ' +
          'Ensure @tiff-provider/core is installed and built (run `pnpm run build:core`).',
      )
    }
    // The Nuxt CLI's build command calls clearBuildDir() which removes everything
    // from buildDir except 'cache/', 'analyze/', 'nuxt.json', and 'nuxt.lock'.
    // We store the SW under buildDir/cache/tiff-sw/ so it survives clearBuildDir.
    // The copy runs at module setup() so the dir exists when nitro:config fires.
    const swDir = join(nuxt.options.buildDir, 'cache', 'tiff-sw')
    mkdirSync(swDir, { recursive: true })
    copyFileSync(swSource, join(swDir, 'tiff-sw.js'))

    // `nitro:config` is a runtime Nuxt hook bridged from Nitro, not yet in NuxtHooks types.
    ;(nuxt.hook as (
      name: 'nitro:config',
      fn: (config: { publicAssets?: Array<{ baseURL?: string; dir: string; maxAge?: number }> }) => void,
    ) => void)('nitro:config', (nitro) => {
      nitro.publicAssets ||= []
      nitro.publicAssets.push({ baseURL: '/', dir: swDir })
    })

    // A SW script must be revalidated so updates reach returning visitors. publicAssets
    // can't emit Cache-Control for a root-scoped/fallthrough asset, so use a route rule.
    // `nitro` is added to NuxtOptions by @nuxt/nitro at runtime; cast to access it.
    const nitroOptions = (nuxt.options as unknown as {
      nitro?: { routeRules?: Record<string, unknown> }
    }).nitro ??= {}
    nitroOptions.routeRules = defu(nitroOptions.routeRules, {
      '/tiff-sw.js': { headers: { 'cache-control': 'no-cache' } },
    })

    // 4. Hand options to the client plugin and register it.
    nuxt.options.runtimeConfig.public.tiff = defu(
      (nuxt.options.runtimeConfig.public.tiff as Record<string, unknown>) || {},
      {
        cacheName: options.cacheName,
        quality: options.quality,
        scope: options.scope,
        retryRacedImages: options.retryRacedImages,
      },
    )
    if (options.autoRegister) {
      addPlugin(resolver.resolve('./runtime/register.client'))
    }
  },
})

export default module
