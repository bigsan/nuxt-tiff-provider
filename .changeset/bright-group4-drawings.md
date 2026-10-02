---
"@tiff-provider/core": patch
"nuxt-tiff-provider": patch
---

Replace utif with utif2 to correctly render bilevel CCITT Group 4 drawings with missing photometric metadata instead of nearly black output. Preserve the existing decoder API and geotiff fallback, and add offline pixel-level and Service Worker regression coverage.
