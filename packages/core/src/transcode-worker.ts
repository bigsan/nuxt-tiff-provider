/// <reference lib="webworker" />
// The page-side transcode worker: a classic script (like tiff-sw.js) with the
// codecs inlined, started by the page's worker pool. Decoding here keeps the
// Service Worker free, runs several images on several cores at once, and lets
// a cancelled image stop mid-decode (the pool terminates the worker).
import { decodeTiff } from './decoder'
import { encodeWebp } from './encoder'
import type { WorkerJobMessage, WorkerReplyMessage } from './transcode-protocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async ({ data }: MessageEvent<WorkerJobMessage>) => {
  let reply: WorkerReplyMessage
  try {
    const t0 = performance.now()
    const decoded = await decodeTiff(data.buffer)
    const t1 = performance.now()
    const blob = await encodeWebp(decoded, data.opts)
    reply = { id: data.id, ok: true, blob, decode: t1 - t0, encode: performance.now() - t1 }
  } catch (err) {
    reply = { id: data.id, ok: false, message: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(reply)
}
