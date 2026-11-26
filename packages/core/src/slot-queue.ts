/** Frees a slot taken by {@link SlotQueue.acquire}. Calling it more than once is a no-op. */
export type Release = () => void

export interface SlotQueue {
  /**
   * Wait for a free slot. Waiters are served newest-first (LIFO): during a fast
   * scroll the image requested last is the one the user is looking at.
   *
   * Rejects with `signal.reason` if `signal` is already aborted, or aborts while
   * the caller is still queued; an aborted waiter never takes a slot.
   */
  acquire(signal?: AbortSignal): Promise<Release>
  /** Slots currently held. */
  readonly active: number
  /** Callers still waiting for a slot. */
  readonly pending: number
}

interface Waiter {
  grant: (release: Release) => void
  signal?: AbortSignal
  onAbort?: () => void
}

/** A counting semaphore with a LIFO wait list that drops aborted waiters. */
export function createSlotQueue(limit: number): SlotQueue {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`slot limit must be a positive integer, got ${limit}`)
  }
  let active = 0
  const stack: Waiter[] = []

  function makeRelease(): Release {
    let released = false
    return () => {
      if (released) return
      released = true
      active--
      next()
    }
  }

  function next(): void {
    while (active < limit && stack.length > 0) {
      const waiter = stack.pop()!
      if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort)
      // Belt and braces: the abort listener already removes aborted waiters.
      if (waiter.signal?.aborted) continue
      active++
      waiter.grant(makeRelease())
    }
  }

  return {
    acquire(signal) {
      if (signal?.aborted) return Promise.reject(signal.reason)
      if (active < limit) {
        active++
        return Promise.resolve(makeRelease())
      }
      return new Promise<Release>((resolve, reject) => {
        const waiter: Waiter = { grant: resolve, signal }
        if (signal) {
          waiter.onAbort = () => {
            const i = stack.indexOf(waiter)
            if (i !== -1) stack.splice(i, 1)
            reject(signal.reason)
          }
          signal.addEventListener('abort', waiter.onAbort, { once: true })
        }
        stack.push(waiter)
      })
    },
    get active() {
      return active
    },
    get pending() {
      return stack.length
    },
  }
}
