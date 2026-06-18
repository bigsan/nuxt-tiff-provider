# nuxt-tiff-provider

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
