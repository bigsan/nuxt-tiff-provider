---
"nuxt-tiff-provider": patch
---

Align `@nuxt/kit` and `@nuxt/schema` to v4 and narrow the `nuxt` peer dependency to `^4.0.0`, matching the only version the module is built and tested against. This removes a mixed v3/v4 `@nuxt/schema` in the tree that broke the module build (non-portable inferred types, TS2742).
