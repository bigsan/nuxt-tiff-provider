---
"@tiff-provider/core": minor
"nuxt-tiff-provider": minor
---

Add an `ignoreNativeTiff` option (Nuxt module and `registerTiffServiceWorker`). When true, the native-TIFF probe is skipped and the Service Worker transcodes TIFF to WebP even in browsers that paint TIFF natively (Safari), so every browser gets the same resized, cached WebP. Default false keeps the Safari passthrough.
