import { addDecoder, BaseDecoder } from 'geotiff'

/**
 * Static geotiff decoder registration for the Service Worker.
 *
 * geotiff resolves its codec classes lazily inside `getDecoder`, e.g.
 * `addDecoder([undefined, 1], () => import('./raw.js'))`. That runtime `import()`
 * is disallowed on `ServiceWorkerGlobalScope` by the HTML spec
 * (https://github.com/w3c/ServiceWorker/issues/1356), so `readRasters` throws and
 * the SW falls back to passing the raw TIFF through — which the browser cannot paint.
 *
 * Re-registering the slot with a STATIC thunk (`() => Promise.resolve(...)`)
 * overwrites geotiff's lazy entry in its shared module-level registry, so
 * `getDecoder` resolves the codec without any dynamic import. Importing geotiff
 * runs its default registrations first; this module's top-level call then wins.
 *
 * SCOPE: only the uncompressed (raw) codec is registered. geotiff's `exports` map
 * exposes just `.`, so the concrete compressed codec classes (LZW, Deflate, JPEG,
 * …) are not importable and are not re-exported from the entry point — only
 * `BaseDecoder` is. The sole >8-bit fixture this provider targets is uncompressed,
 * so raw is sufficient; compressed TIFFs remain a documented Service Worker limit.
 */
export class RawDecoder extends BaseDecoder {
  decodeBlock(buffer: ArrayBuffer): ArrayBuffer {
    return buffer
  }
}

// `[undefined, 1]` covers both Compression=1 (none) and a baseline TIFF that omits
// the Compression tag entirely. `getDecoder` calls the thunk then `new Decoder(...)`,
// so the thunk must resolve to the class itself.
addDecoder([undefined, 1], () => Promise.resolve(RawDecoder))
