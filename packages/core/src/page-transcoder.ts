import {
  TRANSCODER_QUERY,
  TRANSCODER_READY,
  TranscodeUnavailableError,
  type TranscodeAskMessage,
  type TranscodeReplyMessage,
} from './transcode-protocol'
import { createWorkerPool, type WorkerLike, type WorkerPool } from './worker-pool'

export interface PageTranscoderOptions {
  /** URL of the prebuilt transcode worker (`tiff-transcode-worker.js`). */
  workerUrl: string
  /** Workers to run at once. Default: cores − 1, between 1 and 4. */
  size?: number
}

export interface PageTranscoderDeps {
  serviceWorker: Pick<ServiceWorkerContainer, 'addEventListener' | 'controller' | 'startMessages'>
  createWorker: (url: string) => WorkerLike
  hardwareConcurrency?: number
}

/**
 * Run TIFF transcodes for the Service Worker on a pool of dedicated workers in
 * this page. The SW sends `TIFF_TRANSCODE` with the raw bytes and a reply port;
 * the page answers on the port, and stops the worker when the SW cancels.
 */
export function installPageTranscoder(opts: PageTranscoderOptions, deps?: PageTranscoderDeps): WorkerPool {
  const d: PageTranscoderDeps = deps ?? {
    serviceWorker: navigator.serviceWorker,
    createWorker: (url) => new Worker(url) as unknown as WorkerLike,
    hardwareConcurrency: navigator.hardwareConcurrency,
  }
  const size = opts.size ?? Math.max(1, Math.min(4, (d.hardwareConcurrency ?? 2) - 1))
  const pool = createWorkerPool({ size, create: () => d.createWorker(opts.workerUrl) })
  const sw = d.serviceWorker

  const announce = () => {
    if (!pool.broken) sw.controller?.postMessage({ type: TRANSCODER_READY })
  }

  sw.addEventListener('message', (event) => {
    const data = (event as MessageEvent).data
    if (data?.type === TRANSCODER_QUERY) {
      announce()
      return
    }
    if (data?.type !== 'TIFF_TRANSCODE') return
    const port = (event as MessageEvent).ports[0]
    if (!port) return
    const ask = data as TranscodeAskMessage
    const ctrl = new AbortController()
    port.onmessage = (m) => {
      if (m.data?.type === 'cancel') ctrl.abort(new DOMException('cancelled by the Service Worker', 'AbortError'))
    }
    pool
      .run({ buffer: ask.buffer, opts: ask.opts }, ctrl.signal)
      .then(
        (result): TranscodeReplyMessage => ({ ok: true, ...result }),
        (err): TranscodeReplyMessage | undefined =>
          ctrl.signal.aborted
            ? undefined
            : {
                ok: false,
                unavailable: err instanceof TranscodeUnavailableError,
                broken: pool.broken,
                message: err instanceof Error ? err.message : String(err),
              },
      )
      .then((reply) => {
        if (reply) port.postMessage(reply)
        port.close()
      })
  })
  sw.addEventListener('controllerchange', announce)
  // Messages from the SW queue until the page opts in.
  sw.startMessages()
  announce()
  return pool
}
