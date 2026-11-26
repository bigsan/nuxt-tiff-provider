import type { DecodedImage } from './decoder'
import type { EncodeOptions } from './encoder'
import { cacheKey, parseModifiers, stripProviderParams } from './router'
import { createSlotQueue } from './slot-queue'

/** How many transcodes (download + decode + encode) may run at once. */
export const MAX_CONCURRENT_TRANSCODES = 4

/** The subset of the Cache API the handler uses. */
export interface CacheLike {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
}

export interface TiffHandlerDeps {
  prefix: string
  /** WebP quality 0..1 used when the URL carries no `{prefix}-q`. */
  defaultQuality: number
  /** Defaults to {@link MAX_CONCURRENT_TRANSCODES}. */
  concurrency?: number
  /** True when the page renders TIFF itself, so the SW only passes bytes through. */
  isNative: () => boolean
  fetch: (request: Request) => Promise<Response>
  openCache: () => Promise<CacheLike>
  decode: (buffer: ArrayBuffer) => Promise<DecodedImage>
  encode: (image: DecodedImage, opts: EncodeOptions) => Promise<Blob>
  notify: (pathname: string, decode: number, encode: number, total: number) => Promise<void>
  now: () => number
  /**
   * Resolve on a later macrotask. Decoding is synchronous and blocks the worker,
   * so this lets queued `abort` events land before the decision to decode.
   */
  yieldToEventLoop: () => Promise<void>
  warn: (message: string, err: unknown) => void
}

/** Extends the FetchEvent's lifetime (`event.waitUntil`). */
export type WaitUntil = (promise: Promise<unknown>) => void

export type TiffHandler = (url: URL, signal: AbortSignal, waitUntil: WaitUntil) => Promise<Response>

type Outcome =
  | { kind: 'webp'; blob: Blob; decode: number; encode: number; total: number }
  | { kind: 'upstream'; status: number; statusText: string; headers: [string, string][]; body: ArrayBuffer }

interface Job {
  /** Requests still waiting on this job. Waiters that finish are not subtracted: by then the result is settled. */
  waiters: number
  /** `queued`/`fetching` can be cancelled outright; `processing` only at stage boundaries. */
  phase: 'queued' | 'fetching' | 'processing'
  /** Aborts the slot wait and the upstream fetch once every waiter has gone. */
  controller: AbortController
  result: Promise<Outcome>
  /** Set synchronously when `result` settles. */
  done?: { outcome: Outcome } | { error: unknown }
  /**
   * Resolves once the upstream answered 200 (the job will produce WebP or fail
   * in decode/encode) or `result` settled, whichever comes first. Never rejects.
   */
  ready: Promise<void>
  /** Never rejects; settles once the result is cached (or the job failed). */
  settled: Promise<void>
}

const WEBP_HEADERS = {
  'Content-Type': 'image/webp',
  'Cache-Control': 'no-cache',
  'X-Tiff-Transcoded': '1',
} as const

function abortError(): DOMException {
  return new DOMException('All requests for this transcode were cancelled', 'AbortError')
}

/** `promise`, but rejecting with `signal.reason` as soon as `signal` aborts. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

/**
 * The Service Worker's request handler, with its browser dependencies injected
 * so it can be tested in Node.
 *
 * - Each request's `signal` is honored: a cancelled request stops waiting at
 *   once, and never triggers the raw-TIFF passthrough fallback.
 * - Requests for the same cache key share one transcode. The shared download is
 *   aborted only when every request for it has been cancelled; decode and encode
 *   cannot be interrupted, so they are skipped at stage boundaries instead.
 * - At most `concurrency` transcodes run at once; the newest request goes next.
 * - The cache write and timing notification run under `waitUntil`, after the
 *   response, and an encoded result is cached even if its requests were cancelled
 *   (scrolling back then hits the cache).
 */
export function createTiffHandler(deps: TiffHandlerDeps): TiffHandler {
  const { prefix } = deps
  const slots = createSlotQueue(deps.concurrency ?? MAX_CONCURRENT_TRANSCODES)
  const jobs = new Map<string, Job>()

  function rawRequest(url: URL, signal: AbortSignal): Request {
    return new Request(stripProviderParams(url, prefix), { mode: 'cors', signal })
  }

  function leave(key: string, job: Job): void {
    job.waiters--
    if (job.waiters > 0) return
    if (job.phase === 'queued' || job.phase === 'fetching') {
      job.controller.abort(abortError())
      // A new request must start fresh rather than join a cancelled download.
      if (jobs.get(key) === job) jobs.delete(key)
    }
    // In `processing`, the entry stays so a new request can still join; the job
    // checks for waiters before each stage.
  }

  function startJob(key: string, url: URL, cache: CacheLike): Job {
    const controller = new AbortController()
    const job = { waiters: 0, phase: 'queued', controller } as Job
    let markReady!: () => void
    job.ready = new Promise<void>((resolve) => (markReady = resolve))

    const checkpoint = () => {
      if (job.waiters === 0) throw abortError()
    }

    job.result = (async (): Promise<Outcome> => {
      const release = await slots.acquire(controller.signal)
      try {
        job.phase = 'fetching'
        const t0 = deps.now()
        const res = await deps.fetch(rawRequest(url, controller.signal))
        if (!res.ok) {
          return {
            kind: 'upstream',
            status: res.status,
            statusText: res.statusText,
            headers: [...res.headers],
            body: await res.arrayBuffer(),
          }
        }
        markReady()
        const buffer = await res.arrayBuffer()
        job.phase = 'processing'

        await deps.yieldToEventLoop()
        checkpoint()
        const decoded = await deps.decode(buffer)
        const t1 = deps.now()

        checkpoint()
        const { targetWidth, targetHeight, quality } = parseModifiers(url, prefix)
        const blob = await deps.encode(decoded, {
          targetWidth,
          targetHeight,
          quality: Number.isFinite(quality) ? quality : deps.defaultQuality,
        })
        const t2 = deps.now()
        return { kind: 'webp', blob, decode: t1 - t0, encode: t2 - t1, total: t2 - t0 }
      } finally {
        release()
      }
    })()

    job.result.then(
      (outcome) => (job.done = { outcome }),
      (error) => (job.done = { error }),
    )
    job.result.then(markReady, markReady)

    job.settled = job.result
      .then(
        async (outcome) => {
          if (outcome.kind !== 'webp') return
          try {
            await cache.put(key, new Response(outcome.blob, { headers: WEBP_HEADERS }))
          } catch (err) {
            deps.warn('[tiff-sw] cache write failed:', err)
          }
          try {
            await deps.notify(url.pathname, outcome.decode, outcome.encode, outcome.total)
          } catch (err) {
            deps.warn('[tiff-sw] timing notification failed:', err)
          }
        },
        () => {},
      )
      .finally(() => {
        if (jobs.get(key) === job) jobs.delete(key)
      })

    jobs.set(key, job)
    return job
  }

  function toResponse(outcome: Outcome): Response {
    if (outcome.kind === 'webp') return new Response(outcome.blob, { headers: WEBP_HEADERS })
    return new Response(outcome.body, {
      status: outcome.status,
      statusText: outcome.statusText,
      headers: outcome.headers,
    })
  }

  return async function handleTiff(url, signal, waitUntil) {
    if (deps.isNative()) return deps.fetch(rawRequest(url, signal))

    const cache = await deps.openCache()
    // Normalize the cache key so a cold-load retry (which adds {prefix}-retry to
    // bust the browser cache) shares the same entry as a normal request.
    const key = cacheKey(url, prefix)
    const cached = await cache.match(key)
    if (cached) return cached
    signal.throwIfAborted()

    // No await between the lookup and the join, so two requests can never both
    // miss the map and start two transcodes.
    const job = jobs.get(key) ?? startJob(key, url, cache)
    job.waiters++
    waitUntil(job.settled)

    // Two cancellation sources: the request signal (which Chromium does not fire
    // for a FetchEvent) and the streamed body's cancel() (which it does). Leave
    // the job at most once, whichever fires first.
    let left = false
    const onCancel = () => {
      if (left) return
      left = true
      leave(key, job)
    }
    signal.addEventListener('abort', onCancel, { once: true })
    const detach = () => signal.removeEventListener('abort', onCancel)

    const fallback = (err: unknown): Promise<Response> => {
      deps.warn('[tiff-sw] transcode failed, passing through:', err)
      return deps.fetch(rawRequest(url, signal))
    }

    try {
      await raceAbort(job.ready, signal)
    } catch (err) {
      detach()
      throw err
    }

    const done = job.done
    if (done) {
      detach()
      if ('outcome' in done) return toResponse(done.outcome)
      return fallback(done.error)
    }

    // The upstream answered 200 and the transcode is still running: commit to a
    // WebP response now, so the page can cancel it through the body stream while
    // we download, decode and encode. A later failure errors the stream (the
    // <img> fires `error`); there is no passthrough fallback past this point.
    let closed = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        job.result
          .then((outcome) => {
            if (outcome.kind !== 'webp') throw new Error(`unexpected outcome ${outcome.kind}`)
            return outcome.blob.arrayBuffer()
          })
          .then(
            (bytes) => {
              if (closed) return
              closed = true
              controller.enqueue(new Uint8Array(bytes))
              controller.close()
            },
            (err) => {
              if (closed) return
              closed = true
              if (!signal.aborted) deps.warn('[tiff-sw] transcode failed after the response started:', err)
              controller.error(err)
            },
          )
          .finally(detach)
      },
      cancel() {
        closed = true
        onCancel()
        detach()
      },
    })
    return new Response(body, { headers: WEBP_HEADERS })
  }
}
