import {
  TranscodeFailedError,
  TranscodeUnavailableError,
  type TranscodeRequest,
  type TranscodeResult,
  type WorkerJobMessage,
  type WorkerReplyMessage,
} from './transcode-protocol'

/** The subset of `Worker` the pool uses. */
export interface WorkerLike {
  onmessage: ((event: { data: WorkerReplyMessage }) => void) | null
  onerror: ((event: unknown) => void) | null
  postMessage(message: WorkerJobMessage, transfer: Transferable[]): void
  terminate(): void
}

export interface WorkerPoolOptions {
  /** How many workers may run at once. */
  size: number
  /** Create one worker. May throw (e.g. blocked by CSP). */
  create: () => WorkerLike
  /** Consecutive worker failures before the pool gives up. Default 3. */
  maxFailures?: number
}

export interface WorkerPool {
  /**
   * Transcode on a worker. Rejects with `TranscodeFailedError` when the bytes
   * cannot be decoded, `TranscodeUnavailableError` when no worker could run the
   * job, or `signal.reason` when cancelled. Cancelling a running job terminates
   * its worker, which is replaced on demand.
   */
  run(request: TranscodeRequest, signal?: AbortSignal): Promise<TranscodeResult>
  /** Jobs on a worker now. */
  readonly busy: number
  /** Jobs waiting for a worker. */
  readonly queued: number
  /** True once workers kept failing; every `run` then rejects as unavailable. */
  readonly broken: boolean
}

interface Job {
  id: number
  request: TranscodeRequest
  resolve: (result: TranscodeResult) => void
  reject: (err: unknown) => void
  signal?: AbortSignal
  onAbort?: () => void
  worker?: Slot
}

interface Slot {
  worker: WorkerLike
  job?: Job
}

export function createWorkerPool(options: WorkerPoolOptions): WorkerPool {
  const { size, create, maxFailures = 3 } = options
  const slots: Slot[] = []
  const queue: Job[] = []
  let nextId = 1
  let failures = 0
  let broken = false

  function finish(job: Job): void {
    if (job.signal && job.onAbort) job.signal.removeEventListener('abort', job.onAbort)
  }

  function retire(slot: Slot): void {
    slot.worker.onmessage = null
    slot.worker.onerror = null
    slot.worker.terminate()
    slots.splice(slots.indexOf(slot), 1)
  }

  function spawn(): Slot | undefined {
    let worker: WorkerLike
    try {
      worker = create()
    } catch {
      failures++
      if (failures >= maxFailures) broken = true
      return undefined
    }
    const slot: Slot = { worker }
    worker.onmessage = ({ data }) => {
      const job = slot.job
      if (!job || data.id !== job.id) return
      slot.job = undefined
      finish(job)
      if (data.ok) {
        failures = 0
        job.resolve({ blob: data.blob, decode: data.decode, encode: data.encode })
      } else {
        job.reject(new TranscodeFailedError(data.message))
      }
      pump()
    }
    worker.onerror = () => {
      const job = slot.job
      slot.job = undefined
      retire(slot)
      failures++
      if (failures >= maxFailures) broken = true
      if (job) {
        finish(job)
        job.reject(new TranscodeUnavailableError('transcode worker failed'))
      }
      pump()
    }
    slots.push(slot)
    return slot
  }

  function start(slot: Slot, job: Job): void {
    slot.job = job
    job.worker = slot
    slot.worker.postMessage({ id: job.id, buffer: job.request.buffer, opts: job.request.opts }, [
      job.request.buffer,
    ])
  }

  function pump(): void {
    while (queue.length > 0) {
      if (broken) {
        for (const job of queue.splice(0)) {
          finish(job)
          job.reject(new TranscodeUnavailableError('transcode workers unavailable'))
        }
        return
      }
      let slot = slots.find((s) => !s.job)
      if (!slot && slots.length < size) slot = spawn()
      if (!slot) {
        // Creation failed: retry with the next job unless the pool is now broken.
        if (slots.length < size && !broken) {
          const job = queue.shift()!
          finish(job)
          job.reject(new TranscodeUnavailableError('could not create a transcode worker'))
          continue
        }
        return
      }
      start(slot, queue.shift()!)
    }
  }

  return {
    run(request, signal) {
      if (signal?.aborted) return Promise.reject(signal.reason)
      if (broken) return Promise.reject(new TranscodeUnavailableError('transcode workers unavailable'))
      return new Promise<TranscodeResult>((resolve, reject) => {
        const job: Job = { id: nextId++, request, resolve, reject, signal }
        if (signal) {
          job.onAbort = () => {
            const i = queue.indexOf(job)
            if (i !== -1) {
              queue.splice(i, 1)
            } else if (job.worker && job.worker.job === job) {
              // Decoding cannot be interrupted, so stop the worker itself.
              retire(job.worker)
            }
            reject(signal.reason)
            pump()
          }
          signal.addEventListener('abort', job.onAbort, { once: true })
        }
        queue.push(job)
        pump()
      })
    },
    get busy() {
      return slots.filter((s) => s.job).length
    },
    get queued() {
      return queue.length
    },
    get broken() {
      return broken
    },
  }
}
