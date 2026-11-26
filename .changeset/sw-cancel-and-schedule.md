---
"@tiff-provider/core": minor
"nuxt-tiff-provider": minor
---

Stop wasting Service Worker time on images the page no longer wants (#3).

- A cancelled request (an aborted `fetch`, or an `<img>` whose `src` is cleared or changed) now aborts the upstream download and skips the decode and encode steps that have not started. Chromium never fires the FetchEvent's `request.signal`, so once the upstream answers 200 the SW streams its WebP response and learns of the cancel through the body stream; a request cancelled before the upstream answers is dropped as soon as it does. The signal is still honoured where browsers fire it.
- A cancelled request no longer triggers a second, full download of the raw TIFF through the passthrough fallback.
- At most 4 transcodes run at once, and the most recently requested image goes next.
- Requests for the same image and size (including the `{prefix}-retry` variant) share one transcode.
- The cache write and timing notification no longer delay the response, and a failed cache write no longer falls back to the raw TIFF.

Behaviour change: a download or decode that fails after the upstream answered 200 now makes the `<img>` fire `error` (retried once by the raced-image recovery) instead of passing the raw TIFF through. Upstream error statuses are still returned as is.
