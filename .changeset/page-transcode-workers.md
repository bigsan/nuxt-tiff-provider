---
"@tiff-provider/core": minor
"nuxt-tiff-provider": minor
---

Decode on a pool of dedicated workers in the page instead of in the Service Worker.

TIFF decoding is synchronous, so in the SW it ran one image at a time and blocked every other request until it finished (an A4 Group 4 scan takes about 3 s). The page now runs up to 4 transcodes at once on its own workers, served from the new `tiff-transcode-worker.js` artifact. The SW stays responsive, and a cancelled image stops mid-decode because its worker is terminated. In the repository's benchmark (`pnpm run bench`: headless Chromium on a 24-core machine, local server), eight A4 Group 4 scans painted in about 6 s instead of 22 s, and the longest SW stall fell from about 11 s to under 20 ms. Results depend on the machine's cores and the images.

The SW still decodes by itself when no page pool is available, for example when the worker script cannot load. New options: `transcodeWorkers` (default `true`; Nuxt module and `registerTiffServiceWorker`) and `workerUrl` (default `/tiff-transcode-worker.js`; `registerTiffServiceWorker`). The Nuxt module serves the worker script automatically.
