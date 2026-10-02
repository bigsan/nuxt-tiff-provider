# nuxt-tiff-provider

## 0.3.2

### Patch Changes

- 15e53df: Replace utif with utif2 to correctly render bilevel CCITT Group 4 drawings with missing photometric metadata instead of nearly black output. Preserve the existing decoder API and geotiff fallback, and add offline pixel-level and Service Worker regression coverage.
- 5a0a46c: Keep CMYK TIFFs decoding correctly after the switch to utif2. utif2's CMYK path reads the global `window`, which does not exist in a Service Worker or in Node, so the decode threw and the geotiff fallback rendered the four inks as RGBA — a nearly transparent image. The decoder now lends utif2 a `window` for the duration of that one call. Adds a CMYK fixture with decoder and Service Worker regression coverage.
- Updated dependencies [15e53df]
- Updated dependencies [5a0a46c]
  - @tiff-provider/core@0.3.2

## 0.3.1

### Patch Changes

- e8c571f: Align `@nuxt/kit` and `@nuxt/schema` to v4 and narrow the `nuxt` peer dependency to `^4.0.0`, matching the only version the module is built and tested against. This removes a mixed v3/v4 `@nuxt/schema` in the tree that broke the module build (non-portable inferred types, TS2742).
- fa44ad2: Add `repository`, `homepage`, and `bugs` metadata so npm shows the source repository and links back to GitHub.
- Updated dependencies [fa44ad2]
  - @tiff-provider/core@0.3.1

## 0.3.0

### Minor Changes

- e808a85: Namespace all provider query params under a configurable `paramPrefix` (default `tp`) and fix source-URL handling.

  **Breaking (pre-1.0, shipped as a minor):** provider URLs now use `tp=1&tp-w=…` instead of `fmt=webp&w=…`; `buildTiffUrl`, `shouldIntercept`, and `parseModifiers` signatures changed (`shouldIntercept`/`parseModifiers` now take a `prefix`).

  - Preserve an existing query string / hash on the source URL, so signed URLs stay valid; the SW's upstream fetch strips only provider params.
  - Interception is marker-driven (`{prefix}=1`), not file-extension-based, so extension-less sources (e.g. an S3 object served as TIFF) work when marked.
  - Honor `height` via aspect-fit resize; output is WebP-only (`format` is accepted but ignored).
  - Cross-origin sources transcode when CORS-readable (the SW raw fetch uses `mode: 'cors'`).
  - New `paramPrefix` option on the Nuxt module and `registerTiffServiceWorker`.
  - The cold-load recovery marker is namespaced (`{prefix}-retry`) and normalized out of the cache key, so a retry no longer breaks signed URLs or duplicates cache entries.

### Patch Changes

- Updated dependencies [e808a85]
  - @tiff-provider/core@0.3.0

## 0.2.0

### Minor Changes

- Auto-recover TIFF images that race the Service Worker on a cold load: a failed `<img>` is re-fetched once the SW controls the page, so a plain `<NuxtImg>` renders on the first visit without a per-page gate. Adds a `retryRacedImages` option (default `true`) to toggle it.

### Patch Changes

- Updated dependencies
  - @tiff-provider/core@0.2.0
