import { registerTiffServiceWorker } from '@tiff-provider/core/register'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return
  const cfg = useRuntimeConfig().public.tiff as {
    cacheName?: string
    quality?: number
    scope?: string
    retryRacedImages?: boolean
    paramPrefix?: string
  }
  void registerTiffServiceWorker({
    scope: cfg.scope,
    cacheName: cfg.cacheName,
    quality: cfg.quality,
    retryRacedImages: cfg.retryRacedImages,
    paramPrefix: cfg.paramPrefix,
  })
})
