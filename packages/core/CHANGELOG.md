# @tiff-provider/core

## 0.2.0

### Minor Changes

- Auto-recover TIFF images that race the Service Worker on a cold load: a failed `<img>` is re-fetched once the SW controls the page, so a plain `<NuxtImg>` renders on the first visit without a per-page gate. Adds a `retryRacedImages` option (default `true`) to toggle it.
