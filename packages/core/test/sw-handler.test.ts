import { describe, expect, it, vi } from 'vitest'
import type { DecodedImage } from '../src/decoder'
import type { EncodeOptions } from '../src/encoder'
import { cacheKey } from '../src/router'
import { createTiffHandler, type CacheLike } from '../src/sw-handler'
import {
  TranscodeFailedError,
  TranscodeUnavailableError,
  type TranscodeRequest,
  type TranscodeResult,
} from '../src/transcode-protocol'

// ---------------------------------------------------------------------------
// Harness. Every browser dependency is a fake that follows the real rules:
// - fetch rejects with an AbortError when its request's signal aborts;
// - waitUntil throws once the request's handler promise has settled
//   (InvalidStateError in a real FetchEvent);
// - each slow stage (fetch, decode, encode, cache.put) is a deferred the test
//   resolves, so the test controls the interleaving.
// ---------------------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await tick()
}

// Node's undici links `request.signal` to the init signal through a WeakRef, so
// after a GC an abort can silently stop propagating (browsers hold it strongly).
// Record the init signal so the fakes see exactly what the handler passed.
const initSignals = new WeakMap<Request, AbortSignal>()
class RecordingRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init)
    if (init?.signal) initSignals.set(this, init.signal)
  }
}
vi.stubGlobal('Request', RecordingRequest)

const BASE = 'https://img.test'
const tif = (name: string, extra = '') => `${BASE}/${name}.tif?tp&tp-w=100${extra}`
/** The cache key the handler uses for `tif(name)`. */
const key = (name: string) => cacheKey(new URL(tif(name)), 'tp')

interface FetchCall {
  url: string
  signal: AbortSignal
  d: Deferred<Response>
}

interface RemoteCall {
  clientId: string | undefined
  request: TranscodeRequest
  signal: AbortSignal
  d: Deferred<TranscodeResult>
}

function setup(
  opts: { concurrency?: number; native?: boolean; autoDecode?: boolean; autoEncode?: boolean; remote?: boolean } = {},
) {
  const remoteCalls: RemoteCall[] = []
  const fetchCalls: FetchCall[] = []
  const decodeCalls: Deferred<DecodedImage>[] = []
  const encodeCalls: { opts: EncodeOptions; d: Deferred<Blob> }[] = []
  const store = new Map<string, Response>()
  const puts: string[] = []
  let putGate: Promise<void> | null = null
  let putError: unknown = null
  const notify = vi.fn(async () => {})
  const warn = vi.fn()

  const cache: CacheLike = {
    async match(key) {
      return store.get(key)?.clone()
    },
    async put(key, response) {
      puts.push(key)
      if (putGate) await putGate
      if (putError) throw putError
      store.set(key, response)
    },
  }

  const image: DecodedImage = { width: 4, height: 4, rgba: new Uint8ClampedArray(64) }

  const handler = createTiffHandler({
    prefix: 'tp',
    defaultQuality: 0.8,
    concurrency: opts.concurrency ?? 4,
    isNative: () => opts.native ?? false,
    fetch: (request) => {
      const d = deferred<Response>()
      const signal = initSignals.get(request) ?? request.signal
      fetchCalls.push({ url: request.url, signal, d })
      const abort = () => d.reject(new DOMException('The operation was aborted.', 'AbortError'))
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
      return d.promise
    },
    openCache: async () => cache,
    decode: () => {
      if (opts.autoDecode) return Promise.resolve(image)
      const d = deferred<DecodedImage>()
      decodeCalls.push(d)
      return d.promise
    },
    encode: (_img, encodeOpts) => {
      if (opts.autoEncode) return Promise.resolve(new Blob(['webp'], { type: 'image/webp' }))
      const d = deferred<Blob>()
      encodeCalls.push({ opts: encodeOpts, d })
      return d.promise
    },
    notify,
    now: () => 0,
    yieldToEventLoop: () => tick().then(() => {}),
    warn,
    remote: opts.remote
      ? (clientId, request, signal) => {
          const d = deferred<TranscodeResult>()
          remoteCalls.push({ clientId, request, signal, d })
          signal.addEventListener('abort', () => d.reject(signal.reason), { once: true })
          return d.promise
        }
      : undefined,
  })

  function request(url: string, clientId?: string) {
    const ctrl = new AbortController()
    const extended: Promise<unknown>[] = []
    let settled = false
    const waitUntil = (p: Promise<unknown>) => {
      if (settled) throw new DOMException('respondWith already settled', 'InvalidStateError')
      extended.push(p)
    }
    const response = handler(new URL(url), ctrl.signal, waitUntil, clientId)
    response.then(
      () => (settled = true),
      () => (settled = true),
    )
    return { ctrl, response, extended, abort: () => ctrl.abort() }
  }

  const tiffBytes = () => new Response(new Uint8Array([0x49, 0x49, 42, 0]), { status: 200 })
  const webp = (label = 'webp') => new Blob([label], { type: 'image/webp' })

  return {
    request,
    remoteCalls,
    fetchCalls,
    decodeCalls,
    encodeCalls,
    store,
    puts,
    notify,
    warn,
    image,
    tiffBytes,
    webp,
    gatePuts(gate: Promise<void>) {
      putGate = gate
    },
    failPuts(err: unknown) {
      putError = err
    },
  }
}

/** Drive a fresh request through fetch, decode and encode to a WebP response. */
async function completeJob(h: ReturnType<typeof setup>, callIndex: number, label = 'webp') {
  h.fetchCalls[callIndex]!.d.resolve(h.tiffBytes())
  await flush()
  h.decodeCalls.at(-1)!.resolve(h.image)
  await flush()
  h.encodeCalls.at(-1)!.d.resolve(h.webp(label))
  await flush()
}

async function completeJobAfterFetch(h: ReturnType<typeof setup>) {
  await flush()
  h.decodeCalls.at(-1)!.resolve(h.image)
  await flush()
  h.encodeCalls.at(-1)!.d.resolve(h.webp())
  await flush()
}

const expectAbortError = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ name: 'AbortError' })

/** Cancel the way Chromium does once the response is committed: through its body stream. */
async function cancelBody(r: { response: Promise<Response> }): Promise<void> {
  await (await r.response).body!.cancel()
}

// ---------------------------------------------------------------------------

describe('createTiffHandler: basic paths', () => {
  it('native mode passes the raw request through with the page signal', async () => {
    const h = setup({ native: true })
    const r = h.request(tif('a', '&tp-q=50'))
    await flush()
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.fetchCalls[0]!.url).toBe(`${BASE}/a.tif`)
    r.abort()
    expect(h.fetchCalls[0]!.signal.aborted).toBe(true)
    await expectAbortError(r.response)
  })

  it('serves a cache hit without fetching', async () => {
    const h = setup()
    h.store.set(key('a'), new Response('cached'))
    const r = h.request(tif('a', '&tp-retry=1'))
    expect(await (await r.response).text()).toBe('cached')
    expect(h.fetchCalls).toHaveLength(0)
  })

  it('transcodes a miss, then caches and notifies under waitUntil', async () => {
    const h = setup()
    const r = h.request(tif('a', '&tp-retry=1'))
    await flush()
    expect(h.fetchCalls[0]!.url).toBe(`${BASE}/a.tif`)
    await completeJob(h, 0)

    const res = await r.response
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('X-Tiff-Transcoded')).toBe('1')
    expect(await res.text()).toBe('webp')
    expect(h.encodeCalls[0]!.opts).toEqual({ targetWidth: 100, targetHeight: undefined, quality: 0.8 })

    expect(r.extended).toHaveLength(1)
    await Promise.all(r.extended)
    expect(h.puts).toEqual([key('a')]) // the retry marker is not part of the key
    expect(await h.store.get(key('a'))!.clone().text()).toBe('webp')
    expect(h.notify).toHaveBeenCalledWith('/a.tif', 0, 0, 0)
  })

  it('does not hold the response for the cache write', async () => {
    const h = setup()
    const gate = deferred<void>()
    h.gatePuts(gate.promise)
    const r = h.request(tif('a'))
    await flush()
    await completeJob(h, 0)
    expect(await (await r.response).text()).toBe('webp')
    expect(h.store.has(key('a'))).toBe(false)
    gate.resolve()
    await Promise.all(r.extended)
    expect(h.store.has(key('a'))).toBe(true)
  })

  it('returns an upstream error status as is, without caching or a fallback fetch', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(new Response('nope', { status: 404, statusText: 'Not Found' }))
    const res = await r.response
    expect(res.status).toBe(404)
    expect(res.statusText).toBe('Not Found')
    expect(await res.text()).toBe('nope')
    await Promise.all(r.extended)
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.decodeCalls).toHaveLength(0)
    expect(h.puts).toHaveLength(0)
  })

  it('commits a streamed WebP response as soon as the upstream answers 200', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    const res = await r.response // before decode or encode has finished
    expect(h.encodeCalls).toHaveLength(0)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    const text = res.text()
    await flush()
    h.decodeCalls[0]!.resolve(h.image)
    await flush()
    h.encodeCalls[0]!.d.resolve(h.webp())
    expect(await text).toBe('webp')
  })

  it('errors the committed stream when decoding fails, with no passthrough fetch', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    const res = await r.response
    const text = res.text()
    await flush()
    h.decodeCalls[0]!.reject(new Error('bad tiff'))
    await expect(text).rejects.toThrow('bad tiff')
    await Promise.all(r.extended)
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.puts).toHaveLength(0)
    expect(h.warn).toHaveBeenCalledWith('[tiff-sw] transcode failed after the response started:', expect.any(Error))
  })

  it('returns a shared upstream error status when the job settled before committing', async () => {
    const h = setup()
    const gate = deferred<void>()
    h.gatePuts(gate.promise)
    const a = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(new Response('nope', { status: 500 }))
    expect((await a.response).status).toBe(500)
    gate.resolve()
  })

  it('falls back when the upstream fetch fails with a network error', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.reject(new TypeError('Failed to fetch'))
    await flush()
    expect(h.fetchCalls).toHaveLength(2)
    h.fetchCalls[1]!.d.resolve(new Response('raw'))
    expect(await (await r.response).text()).toBe('raw')
  })

  it('still serves the WebP when the cache write fails', async () => {
    const h = setup()
    h.failPuts(new Error('quota'))
    const r = h.request(tif('a'))
    await flush()
    await completeJob(h, 0)
    expect(await (await r.response).text()).toBe('webp')
    await Promise.all(r.extended)
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.warn).toHaveBeenCalledWith('[tiff-sw] cache write failed:', expect.any(Error))
  })
})

describe('createTiffHandler: cancellation', () => {
  it('rejects at once for a request already aborted after a cache miss, without fetching', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    r.abort()
    await expectAbortError(r.response)
    await flush()
    expect(h.fetchCalls).toHaveLength(0)
  })

  it('aborts the upstream download and sends no fallback request', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    r.abort()
    await expectAbortError(r.response)
    await flush()
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.fetchCalls[0]!.signal.aborted).toBe(true)
    expect(h.decodeCalls).toHaveLength(0)
    expect(h.warn).not.toHaveBeenCalled()
  })

  it('skips decoding when cancelled after the download finished', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    r.abort()
    await expectAbortError(r.response)
    await flush()
    expect(h.decodeCalls).toHaveLength(0)
    expect(h.fetchCalls).toHaveLength(1)
  })

  it('skips decoding when the body is cancelled before decode starts', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await cancelBody(r) // the decode waits a macrotask first
    await flush()
    expect(h.decodeCalls).toHaveLength(0)
    expect(h.fetchCalls).toHaveLength(1)
  })

  it('skips encoding when the body is cancelled during decode', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await flush()
    await cancelBody(r)
    h.decodeCalls[0]!.resolve(h.image)
    await flush()
    expect(h.encodeCalls).toHaveLength(0)
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.puts).toHaveLength(0)
  })

  it('caches a result whose encode finished after every request was cancelled', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await flush()
    h.decodeCalls[0]!.resolve(h.image)
    await flush()
    await cancelBody(r)
    h.encodeCalls[0]!.d.resolve(h.webp())
    await Promise.all(r.extended)
    expect(h.puts).toEqual([key('a')])
    expect(h.fetchCalls).toHaveLength(1)
  })
})

describe('createTiffHandler: in-flight dedupe', () => {
  it('shares one transcode between same-tick requests, including the retry variant', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    const b = h.request(tif('a', '&tp-retry=1'))
    await flush()
    expect(h.fetchCalls).toHaveLength(1)
    await completeJob(h, 0)
    const [ra, rb] = await Promise.all([a.response, b.response])
    expect(await ra.text()).toBe('webp')
    expect(await rb.text()).toBe('webp')
    await Promise.all([...a.extended, ...b.extended])
    expect(h.decodeCalls).toHaveLength(1)
    expect(h.puts).toEqual([key('a')])
  })

  it('does not share work between different output sizes', async () => {
    const h = setup()
    h.request(tif('a'))
    h.request(`${BASE}/a.tif?tp&tp-w=200`)
    await flush()
    expect(h.fetchCalls).toHaveLength(2)
  })

  it('keeps the download going when one of two requests is cancelled', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    const b = h.request(tif('a'))
    await flush()
    b.abort()
    await expectAbortError(b.response)
    expect(h.fetchCalls[0]!.signal.aborted).toBe(false)
    await completeJob(h, 0)
    expect(await (await a.response).text()).toBe('webp')
  })

  it('serves the second request when the request that started the job is cancelled', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    const b = h.request(tif('a'))
    await flush()
    a.abort()
    await expectAbortError(a.response)
    await completeJob(h, 0)
    expect(await (await b.response).text()).toBe('webp')
    await Promise.all(b.extended)
    expect(h.puts).toEqual([key('a')])
  })

  it('aborts the shared download once every request is cancelled, and starts fresh for the next', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    const b = h.request(tif('a'))
    await flush()
    a.abort()
    b.abort()
    // Same tick as the aborts: the cancelled job must already be unjoinable.
    const c = h.request(tif('a'))
    await Promise.all([expectAbortError(a.response), expectAbortError(b.response)])
    expect(h.fetchCalls[0]!.signal.aborted).toBe(true)
    await flush()
    expect(h.fetchCalls).toHaveLength(2)
    expect(h.fetchCalls[1]!.signal.aborted).toBe(false)
    await completeJob(h, 1)
    expect(await (await c.response).text()).toBe('webp')
  })

  it('lets a new request join a decode whose requests were all cancelled', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await flush()
    await cancelBody(a)

    const b = h.request(tif('a'))
    await flush()
    h.decodeCalls[0]!.resolve(h.image)
    await flush()
    h.encodeCalls[0]!.d.resolve(h.webp())
    expect(await (await b.response).text()).toBe('webp')
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.decodeCalls).toHaveLength(1)
  })

  it('joins a finished job whose cache write is still pending instead of transcoding again', async () => {
    const h = setup()
    const gate = deferred<void>()
    h.gatePuts(gate.promise)
    const a = h.request(tif('a'))
    await flush()
    await completeJob(h, 0)
    await a.response

    const b = h.request(tif('a'))
    expect(await (await b.response).text()).toBe('webp')
    expect(h.fetchCalls).toHaveLength(1)
    gate.resolve()
    await Promise.all([...a.extended, ...b.extended])
  })

  it('forgets a finished job once it is cached', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    await flush()
    await completeJob(h, 0)
    await a.response
    await Promise.all(a.extended)

    h.store.clear()
    h.request(tif('a'))
    await flush()
    expect(h.fetchCalls).toHaveLength(2)
  })

  it('gives each request of a shared upstream error its own readable body', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    const b = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(new Response('gone', { status: 410 }))
    const [ra, rb] = await Promise.all([a.response, b.response])
    expect([ra.status, rb.status]).toEqual([410, 410])
    expect(await ra.text()).toBe('gone')
    expect(await rb.text()).toBe('gone')
  })
})

describe('createTiffHandler: in-flight dedupe with streamed responses', () => {
  it.each([
    ['body, then signal', async (r: { abort: () => void; response: Promise<Response> }) => (await cancelBody(r), r.abort())],
    ['signal, then body', async (r: { abort: () => void; response: Promise<Response> }) => (r.abort(), await cancelBody(r))],
  ])('leaves a shared job only once when both sources cancel (%s)', async (_label, cancelBoth) => {
    const h = setup()
    const a = h.request(tif('a'))
    const b = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await flush()
    await cancelBoth(a)
    const text = (await b.response).text()
    h.decodeCalls[0]!.resolve(h.image)
    await flush()
    expect(h.encodeCalls).toHaveLength(1) // b is still waiting, so encode runs
    h.encodeCalls[0]!.d.resolve(h.webp())
    expect(await text).toBe('webp')
  })

  it('keeps streaming to one request when another cancels its body', async () => {
    const h = setup()
    const a = h.request(tif('a'))
    const b = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    const textA = (await a.response).text()
    await cancelBody(b)
    await completeJobAfterFetch(h)
    expect(await textA).toBe('webp')
  })

  it('cancelling through the signal after commit still lets the job skip later stages', async () => {
    const h = setup()
    const r = h.request(tif('a'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await r.response
    await flush()
    r.abort() // Firefox-style: the FetchEvent's signal fires
    h.decodeCalls[0]!.resolve(h.image)
    await flush()
    expect(h.encodeCalls).toHaveLength(0)
  })
})

describe('createTiffHandler: concurrency limit', () => {
  it('runs at most `concurrency` transcodes at once', async () => {
    const h = setup({ concurrency: 2, autoDecode: true, autoEncode: true })
    const a = h.request(tif('a'))
    h.request(tif('b'))
    h.request(tif('c'))
    await flush()
    expect(h.fetchCalls.map((c) => c.url)).toEqual([`${BASE}/a.tif`, `${BASE}/b.tif`])
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await a.response
    await flush()
    expect(h.fetchCalls).toHaveLength(3)
    expect(h.fetchCalls[2]!.url).toBe(`${BASE}/c.tif`)
  })

  it('starts the most recently requested image next (LIFO)', async () => {
    const h = setup({ concurrency: 1, autoDecode: true, autoEncode: true })
    const a = h.request(tif('a'))
    h.request(tif('b'))
    h.request(tif('c'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await a.response
    await flush()
    expect(h.fetchCalls.map((c) => c.url)).toEqual([`${BASE}/a.tif`, `${BASE}/c.tif`])
  })

  it('never fetches a queued request that was cancelled, and frees no-one-else’s slot', async () => {
    const h = setup({ concurrency: 1, autoDecode: true, autoEncode: true })
    const a = h.request(tif('a'))
    const b = h.request(tif('b'))
    await flush()
    b.abort()
    await expectAbortError(b.response)
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await a.response
    await flush()
    expect(h.fetchCalls.map((c) => c.url)).toEqual([`${BASE}/a.tif`])

    h.request(tif('d'))
    await flush()
    expect(h.fetchCalls.map((c) => c.url)).toEqual([`${BASE}/a.tif`, `${BASE}/d.tif`])
  })

  it('frees the slot when a transcode fails', async () => {
    const h = setup({ concurrency: 1 })
    const a = h.request(tif('a'))
    h.request(tif('b'))
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    await flush()
    const text = (await a.response).text()
    h.decodeCalls[0]!.reject(new Error('bad tiff'))
    await expect(text).rejects.toThrow('bad tiff')
    await flush()
    expect(h.fetchCalls.map((c) => c.url)).toEqual([`${BASE}/a.tif`, `${BASE}/b.tif`])
  })

  it('frees the slot when a running download is cancelled', async () => {
    const h = setup({ concurrency: 1 })
    const a = h.request(tif('a'))
    h.request(tif('b'))
    await flush()
    a.abort()
    await expectAbortError(a.response)
    await flush()
    expect(h.fetchCalls.map((c) => c.url)).toEqual([`${BASE}/a.tif`, `${BASE}/b.tif`])
  })
})

describe('createTiffHandler: page-side (remote) transcode', () => {
  async function fetched(h: ReturnType<typeof setup>, i = 0) {
    h.fetchCalls[i]!.d.resolve(h.tiffBytes())
    await flush()
  }

  it('transcodes on the requesting page and never decodes in the SW', async () => {
    const h = setup({ remote: true })
    const r = h.request(tif('a'), 'page-1')
    await flush()
    await fetched(h)
    expect(h.remoteCalls).toHaveLength(1)
    expect(h.remoteCalls[0]!.clientId).toBe('page-1')
    expect(h.remoteCalls[0]!.request.opts).toEqual({ targetWidth: 100, targetHeight: undefined, quality: 0.8 })
    h.remoteCalls[0]!.d.resolve({ blob: h.webp('remote'), decode: 10, encode: 2 })
    expect(await (await r.response).text()).toBe('remote')
    await Promise.all(r.extended)
    expect(h.decodeCalls).toHaveLength(0)
    expect(h.encodeCalls).toHaveLength(0)
    expect(h.puts).toEqual([key('a')])
  })

  it('decodes in the SW when no page can transcode', async () => {
    const h = setup({ remote: true })
    const r = h.request(tif('a'), 'page-1')
    await flush()
    await fetched(h)
    h.remoteCalls[0]!.d.reject(new TranscodeUnavailableError('no pool'))
    await flush()
    expect(h.decodeCalls).toHaveLength(1)
    h.decodeCalls[0]!.resolve(h.image)
    await flush()
    h.encodeCalls[0]!.d.resolve(h.webp('local'))
    expect(await (await r.response).text()).toBe('local')
  })

  it('treats a remote decode failure as final: no SW decode, the stream errors', async () => {
    const h = setup({ remote: true })
    const r = h.request(tif('a'), 'page-1')
    await flush()
    await fetched(h)
    const text = (await r.response).text()
    h.remoteCalls[0]!.d.reject(new TranscodeFailedError('bad tiff'))
    await expect(text).rejects.toThrow('bad tiff')
    await flush()
    expect(h.decodeCalls).toHaveLength(0)
    expect(h.fetchCalls).toHaveLength(1)
  })

  it('stops the remote transcode once every request has gone, and the next request starts fresh', async () => {
    const h = setup({ remote: true })
    const a = h.request(tif('a'), 'page-1')
    await flush()
    await fetched(h)
    await cancelBody(a)
    expect(h.remoteCalls[0]!.signal.aborted).toBe(true)
    await flush()
    expect(h.decodeCalls).toHaveLength(0) // no SW fallback after a cancel

    h.request(tif('a'), 'page-1')
    await flush()
    expect(h.fetchCalls).toHaveLength(2) // a stopped remote job cannot be joined
  })

  it('keeps the remote transcode running while another request still wants it', async () => {
    const h = setup({ remote: true })
    const a = h.request(tif('a'), 'page-1')
    const b = h.request(tif('a'), 'page-2')
    await flush()
    await fetched(h)
    await cancelBody(a)
    expect(h.remoteCalls[0]!.signal.aborted).toBe(false)
    const text = (await b.response).text()
    h.remoteCalls[0]!.d.resolve({ blob: h.webp('shared'), decode: 1, encode: 1 })
    expect(await text).toBe('shared')
  })

  it('does not start a remote transcode for a request cancelled while the body downloads', async () => {
    const h = setup({ remote: true })
    const r = h.request(tif('a'), 'page-1')
    await flush()
    h.fetchCalls[0]!.d.resolve(h.tiffBytes())
    r.abort() // before the body has been read
    await expectAbortError(r.response)
    await flush()
    expect(h.remoteCalls).toHaveLength(0)
    expect(h.decodeCalls).toHaveLength(0)
  })

  it('frees the slot when a remote transcode is stopped', async () => {
    const h = setup({ remote: true, concurrency: 1 })
    const a = h.request(tif('a'), 'page-1')
    h.request(tif('b'), 'page-1')
    await flush()
    await fetched(h)
    await cancelBody(a)
    await flush()
    expect(h.fetchCalls.map((c) => c.url)).toEqual([`${BASE}/a.tif`, `${BASE}/b.tif`])
  })
})
