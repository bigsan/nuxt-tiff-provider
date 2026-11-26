import { describe, expect, it } from 'vitest'
import {
  TranscodeFailedError,
  TranscodeUnavailableError,
  type WorkerJobMessage,
  type WorkerReplyMessage,
} from '../src/transcode-protocol'
import { createWorkerPool, type WorkerLike } from '../src/worker-pool'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = []
  onmessage: ((event: { data: WorkerReplyMessage }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  posted: WorkerJobMessage[] = []
  terminated = false
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(message: WorkerJobMessage): void {
    this.posted.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  /** Reply to the latest job. */
  reply(ok = true): void {
    const { id } = this.posted.at(-1)!
    this.onmessage?.({
      data: ok
        ? { id, ok: true, blob: new Blob(['webp']), decode: 5, encode: 7 }
        : { id, ok: false, message: 'bad tiff' },
    })
  }
  crash(): void {
    this.onerror?.({ message: 'boom' })
  }
}

function setup(size = 2) {
  FakeWorker.all = []
  const pool = createWorkerPool({ size, create: () => new FakeWorker() })
  const job = () => ({ buffer: new ArrayBuffer(8), opts: { targetWidth: 100 } })
  return { pool, job, workers: FakeWorker.all }
}

describe('createWorkerPool', () => {
  it('creates workers lazily, up to `size`, and runs jobs on them', async () => {
    const { pool, job, workers } = setup(2)
    expect(workers).toHaveLength(0)
    const a = pool.run(job())
    const b = pool.run(job())
    pool.run(job())
    expect(workers).toHaveLength(2)
    expect(pool.queued).toBe(1)
    workers[0]!.reply()
    await expect(a).resolves.toMatchObject({ decode: 5, encode: 7 })
    workers[1]!.reply()
    await b
  })

  it('reuses an idle worker and hands it the next queued job (FIFO)', async () => {
    const { pool, job, workers } = setup(1)
    const a = pool.run(job())
    const b = pool.run({ buffer: new ArrayBuffer(1), opts: { targetWidth: 1 } })
    const c = pool.run({ buffer: new ArrayBuffer(2), opts: { targetWidth: 2 } })
    workers[0]!.reply()
    await a
    expect(workers).toHaveLength(1)
    expect(workers[0]!.posted.at(-1)!.opts.targetWidth).toBe(1)
    workers[0]!.reply()
    await b
    workers[0]!.reply()
    await c
  })

  it('transfers the buffer to the worker', async () => {
    const { pool, workers } = setup(1)
    const buffer = new ArrayBuffer(16)
    void pool.run({ buffer, opts: {} })
    expect(workers[0]!.posted[0]!.buffer).toBe(buffer)
  })

  it('rejects a decode failure as final and keeps the worker', async () => {
    const { pool, job, workers } = setup(1)
    const a = pool.run(job())
    workers[0]!.reply(false)
    await expect(a).rejects.toBeInstanceOf(TranscodeFailedError)
    expect(workers[0]!.terminated).toBe(false)
    const b = pool.run(job())
    expect(workers).toHaveLength(1)
    workers[0]!.reply()
    await b
  })

  it('terminates the worker running a cancelled job and replaces it for the next', async () => {
    const { pool, job, workers } = setup(1)
    const ctrl = new AbortController()
    const a = pool.run(job(), ctrl.signal)
    const b = pool.run(job())
    ctrl.abort()
    await expect(a).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0]!.terminated).toBe(true)
    await tick()
    expect(workers).toHaveLength(2)
    expect(workers[1]!.posted).toHaveLength(1)
    workers[1]!.reply()
    await b
  })

  it('drops a cancelled queued job without posting it or terminating anything', async () => {
    const { pool, job, workers } = setup(1)
    const a = pool.run(job())
    const ctrl = new AbortController()
    const b = pool.run(job(), ctrl.signal)
    ctrl.abort()
    await expect(b).rejects.toMatchObject({ name: 'AbortError' })
    expect(pool.queued).toBe(0)
    workers[0]!.reply()
    await a
    expect(workers[0]!.posted).toHaveLength(1)
    expect(workers[0]!.terminated).toBe(false)
  })

  it('rejects at once for an already-aborted signal', async () => {
    const { pool, job, workers } = setup(1)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(pool.run(job(), ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers).toHaveLength(0)
  })

  it('reports a crashed worker as unavailable and replaces it', async () => {
    const { pool, job, workers } = setup(1)
    const a = pool.run(job())
    workers[0]!.crash()
    await expect(a).rejects.toBeInstanceOf(TranscodeUnavailableError)
    expect(workers[0]!.terminated).toBe(true)
    const b = pool.run(job())
    expect(workers).toHaveLength(2)
    workers[1]!.reply()
    await b
  })

  it('gives up after repeated worker failures (e.g. the script 404s) and rejects new jobs at once', async () => {
    const { pool, job, workers } = setup(1)
    for (let i = 0; i < 3; i++) {
      const p = pool.run(job())
      workers.at(-1)!.crash()
      await expect(p).rejects.toBeInstanceOf(TranscodeUnavailableError)
    }
    const created = workers.length
    await expect(pool.run(job())).rejects.toBeInstanceOf(TranscodeUnavailableError)
    expect(workers).toHaveLength(created)
    expect(pool.broken).toBe(true)
  })

  it('a successful job resets the failure count', async () => {
    const { pool, job, workers } = setup(1)
    for (let i = 0; i < 5; i++) {
      const p = pool.run(job())
      workers.at(-1)!.crash()
      await expect(p).rejects.toBeInstanceOf(TranscodeUnavailableError)
      const ok = pool.run(job())
      workers.at(-1)!.reply()
      await ok
    }
    expect(pool.broken).toBe(false)
  })

  it('reports a worker that cannot be created as unavailable', async () => {
    const pool = createWorkerPool({
      size: 1,
      create: () => {
        throw new Error('blocked by CSP')
      },
    })
    await expect(pool.run({ buffer: new ArrayBuffer(1), opts: {} })).rejects.toBeInstanceOf(
      TranscodeUnavailableError,
    )
  })

  it('ignores a reply for a job it no longer runs', async () => {
    const { pool, job, workers } = setup(1)
    const a = pool.run(job())
    workers[0]!.onmessage?.({ data: { id: 999, ok: true, blob: new Blob(), decode: 0, encode: 0 } })
    expect(pool.busy).toBe(1)
    workers[0]!.reply()
    await a
    expect(pool.busy).toBe(0)
  })
})
