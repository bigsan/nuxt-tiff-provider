---
"@tiff-provider/core": patch
"nuxt-tiff-provider": patch
---

Keep CMYK TIFFs decoding correctly after the switch to utif2. utif2's CMYK path reads the global `window`, which does not exist in a Service Worker or in Node, so the decode threw and the geotiff fallback rendered the four inks as RGBA — a nearly transparent image. The decoder now lends utif2 a `window` for the duration of that one call. Adds a CMYK fixture with decoder and Service Worker regression coverage.
