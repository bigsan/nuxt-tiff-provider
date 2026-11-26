# nuxt-tiff-provider (monorepo)

Render TIFF images in any browser off the main thread. A Service Worker
intercepts `.tif`/`.tiff` requests, decodes them via UTIF or geotiff.js, and
re-encodes to WebP — transparently, with caching. Safari's native TIFF support
is detected and honoured with a passthrough.

## Packages

| Package | Description |
|---------|-------------|
| [`@tiff-provider/core`](packages/core) | Framework-agnostic decode/encode/route logic + prebuilt Service Worker IIFE (`tiff-sw.js`) |
| [`nuxt-tiff-provider`](packages/nuxt) | Nuxt module: registers the `@nuxt/image` provider, serves the prebuilt SW, and wires up a client plugin |

## Develop

```bash
pnpm install
pnpm run gen:samples   # generate TIFF fixtures into playground/public/samples + packages/core/test/fixtures
pnpm dev               # http://localhost:3000

# Optional — the playground's cross-origin (CORS) demo image is served from a
# second origin; start it in another terminal:
pnpm run cors:samples  # sample TIFFs with CORS on http://localhost:3738
```

The playground demonstrates the baseline transcode plus this release's cases:
an existing query string on the source, height-aware (aspect-fit) resizing, a
cross-origin (CORS) source, and a custom `paramPrefix`.

## Test

```bash
pnpm run test:unit     # vitest across all workspace packages (core + nuxt)

pnpm exec playwright install chromium
pnpm run test:e2e      # Playwright: render, liveness, cache, query-string, height, cross-origin
```

## How it works

1. `<NuxtImg provider="tiff" src="/x.tif" width=640>` → the provider emits
   `/x.tif?tp=1&tp-w=640`; given `sizes`, `@nuxt/image` calls the provider
   once per candidate width and assembles the resulting URLs into a `srcset`.
   The provider is a pure, synchronous, isomorphic URL builder — no decoding
   happens here.
2. A Service Worker intercepts requests carrying the provider's marker (`tp` by
   default): cache hit → serve WebP; miss → fetch raw bytes, decode (UTIF →
   geotiff.js fallback), resize + encode to WebP via `OffscreenCanvas`, cache,
   return.
3. Safari (native TIFF) is detected client-side and the SW passes through.

During a fast scroll the SW keeps transcoding cheap for the images that are
left on screen:

- At most 4 transcodes run at once, and the most recently requested image goes
  next. Requests for the same image and size share one transcode.
- Once the upstream answers 200, the SW streams the WebP response, so a request
  the page cancels (an aborted `fetch`, or an `<img>` whose `src` is cleared or
  changed) stops its download and skips the decode and encode steps that have
  not started yet. A request cancelled while the SW still waits for the
  upstream's headers is dropped as soon as they arrive, so it costs only that
  round trip. Work for an image is cancelled only when every request for it has
  gone. An encode that already finished is still cached.
- Because the response is committed early, a download or decode that fails
  after that point makes the `<img>` fire `error` (and the raced-image recovery
  retries it once), instead of passing the raw TIFF through. An upstream error
  status is still returned as is.

The shipped SW is a prebuilt classic IIFE (`dist/tiff-sw.js` inside
`@tiff-provider/core`) with `utif2` + `geotiff` and **all geotiff codecs**
inlined at build time. Consumers never see the dev-time constraint described in
[w3c/ServiceWorker#1356][sw1356]: that runtime `import()` is forbidden inside a
Service Worker. The classic IIFE has every codec statically inlined, so
compressed 16-bit TIFFs (LZW, Deflate, JPEG, …) decode correctly in all
environments including `pnpm dev`.

[sw1356]: https://github.com/w3c/ServiceWorker/issues/1356
