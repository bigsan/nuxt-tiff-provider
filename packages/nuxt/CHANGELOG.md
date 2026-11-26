# nuxt-tiff-provider

## 0.5.0

### Minor Changes

- d17de18: Decode on a pool of dedicated workers in the page instead of in the Service Worker.

  TIFF decoding is synchronous, so in the SW it ran one image at a time and blocked every other request until it finished (an A4 Group 4 scan takes about 3 s). The page now runs up to 4 transcodes at once on its own workers, served from the new `tiff-transcode-worker.js` artifact. The SW stays responsive, and a cancelled image stops mid-decode because its worker is terminated. In the repository's benchmark (`pnpm run bench`: headless Chromium on a 24-core machine, local server), eight A4 Group 4 scans painted in about 6 s instead of 22 s, and the longest SW stall fell from about 11 s to under 20 ms. Results depend on the machine's cores and the images.

  The SW still decodes by itself when no page pool is available, for example when the worker script cannot load. New options: `transcodeWorkers` (default `true`; Nuxt module and `registerTiffServiceWorker`) and `workerUrl` (default `/tiff-transcode-worker.js`; `registerTiffServiceWorker`). The Nuxt module serves the worker script automatically.

- be2df0b: Stop wasting Service Worker time on images the page no longer wants (#3).

  - A cancelled request (an aborted `fetch`, or an `<img>` whose `src` is cleared or changed) now aborts the upstream download and skips the decode and encode steps that have not started. Chromium never fires the FetchEvent's `request.signal`, so once the upstream answers 200 the SW streams its WebP response and learns of the cancel through the body stream; a request cancelled before the upstream answers is dropped as soon as it does. The signal is still honoured where browsers fire it.
  - A cancelled request no longer triggers a second, full download of the raw TIFF through the passthrough fallback.
  - At most 4 transcodes run at once, and the most recently requested image goes next.
  - Requests for the same image and size (including the `{prefix}-retry` variant) share one transcode.
  - The cache write and timing notification no longer delay the response, and a failed cache write no longer falls back to the raw TIFF.

  Behaviour change: a download or decode that fails after the upstream answered 200 now makes the `<img>` fire `error` (retried once by the raced-image recovery) instead of passing the raw TIFF through. Upstream error statuses are still returned as is.

### Patch Changes

- Updated dependencies [d17de18]
- Updated dependencies [be2df0b]
  - @tiff-provider/core@0.5.0

## 0.4.0

### Minor Changes

- 88fdd18: Add an `ignoreNativeTiff` option (Nuxt module and `registerTiffServiceWorker`). When true, the native-TIFF probe is skipped and the Service Worker transcodes TIFF to WebP even in browsers that paint TIFF natively (Safari), so every browser gets the same resized, cached WebP. Default false keeps the Safari passthrough.

### Patch Changes

- Updated dependencies [88fdd18]
  - @tiff-provider/core@0.4.0

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
