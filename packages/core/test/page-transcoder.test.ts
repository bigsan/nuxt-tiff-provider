import { afterEach, describe, expect, it } from 'vitest'
import { installPageTranscoder } from '../src/page-transcoder'
import {
  TRANSCODER_QUERY,
  TRANSCODER_READY,
  type TranscodeReplyMessage,
  type WorkerJobMessage,
  type WorkerReplyMessage,
} from '../src/transcode-protocol'
import type { WorkerLike } from '../src/worker-pool'

const ports: MessagePort[] = []
afterEach(() => {
  for (const p of ports.splice(0)) p.close()
})

class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: WorkerReplyMessage }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  posted: WorkerJobMessage[] = []
  terminated = false
  constructor(public url: string) {}
  postMessage(message: WorkerJobMessage): void {
    this.posted.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  reply(ok = true): void {
    const { id } = this.posted.at(-1)!
    this.onmessage?.({
      data: ok ? { id, ok: true, blob: new Blob(['webp']), decode: 1, encode: 2 } : { id, ok: false, message: 'bad' },
    })
  }
}

function setup() {
  const target = new EventTarget()
  const toSw: unknown[] = []
  const workers: FakeWorker[] = []
  let started = false
  const serviceWorker = {
    addEventListener: target.addEventListener.bind(target),
    controller: { postMessage: (m: unknown) => toSw.push(m) } as unknown as ServiceWorker,
    startMessages: () => {
      started = true
    },
  }
  installPageTranscoder(
    { workerUrl: '/tiff-transcode-worker.js', size: 2 },
    {
      serviceWorker: serviceWorker as never,
      createWorker: (url) => {
        const w = new FakeWorker(url)
        workers.push(w)
        return w
      },
    },
  )
  /** Send a TIFF_TRANSCODE from the "SW"; resolves the page's reply (or undefined). */
  function ask() {
    const ch = new MessageChannel()
    ports.push(ch.port1, ch.port2)
    const replies: TranscodeReplyMessage[] = []
    ch.port1.onmessage = (e) => replies.push(e.data)
    target.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'TIFF_TRANSCODE', buffer: new ArrayBuffer(4), opts: { targetWidth: 9 } },
        ports: [ch.port2],
      }),
    )
    return { replies, cancel: () => ch.port1.postMessage({ type: 'cancel' }) }
  }
  const settle = () => new Promise((r) => setTimeout(r, 5))
  return { target, toSw, workers, ask, settle, started: () => started }
}

describe('installPageTranscoder', () => {
  it('opts in to SW messages and announces itself to the controller', () => {
    const h = setup()
    expect(h.started()).toBe(true)
    expect(h.toSw).toEqual([{ type: TRANSCODER_READY }])
  })

  it('announces again when the SW asks or a new SW takes control', () => {
    const h = setup()
    h.target.dispatchEvent(new MessageEvent('message', { data: { type: TRANSCODER_QUERY } }))
    h.target.dispatchEvent(new Event('controllerchange'))
    expect(h.toSw).toHaveLength(3)
  })

  it('transcodes on a worker and replies on the port', async () => {
    const h = setup()
    const { replies } = h.ask()
    expect(h.workers[0]!.url).toBe('/tiff-transcode-worker.js')
    expect(h.workers[0]!.posted[0]!.opts).toEqual({ targetWidth: 9 })
    h.workers[0]!.reply()
    await h.settle()
    expect(replies).toEqual([expect.objectContaining({ ok: true, decode: 1, encode: 2 })])
  })

  it('stops the worker when the SW cancels, without replying', async () => {
    const h = setup()
    const { replies, cancel } = h.ask()
    cancel()
    await h.settle()
    expect(h.workers[0]!.terminated).toBe(true)
    expect(replies).toEqual([])
  })

  it('reports a crashed worker as unavailable and a decode failure as final', async () => {
    const h = setup()
    const crash = h.ask()
    h.workers[0]!.onerror?.({})
    const bad = h.ask()
    h.workers.at(-1)!.reply(false)
    await h.settle()
    expect(crash.replies).toEqual([expect.objectContaining({ ok: false, unavailable: true })])
    expect(bad.replies).toEqual([expect.objectContaining({ ok: false, unavailable: false })])
  })

  it('tells the SW when the pool has given up, and stops announcing itself', async () => {
    const h = setup()
    let last
    for (let i = 0; i < 3; i++) {
      last = h.ask()
      h.workers.at(-1)!.onerror?.({})
    }
    await h.settle()
    expect(last!.replies).toEqual([expect.objectContaining({ ok: false, unavailable: true, broken: true })])
    h.target.dispatchEvent(new MessageEvent('message', { data: { type: TRANSCODER_QUERY } }))
    expect(h.toSw).toHaveLength(1) // only the announcement made at install
  })

  it('ignores unrelated messages and asks without a port', () => {
    const h = setup()
    h.target.dispatchEvent(new MessageEvent('message', { data: { type: 'TIFF_TIMING' } }))
    h.target.dispatchEvent(new MessageEvent('message', { data: { type: 'TIFF_TRANSCODE' } }))
    expect(h.workers).toHaveLength(0)
  })
})
