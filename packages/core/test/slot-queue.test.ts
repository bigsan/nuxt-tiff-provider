import { describe, expect, it } from 'vitest'
import { createSlotQueue } from '../src/slot-queue'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createSlotQueue', () => {
  it('rejects a non-positive or fractional limit', () => {
    expect(() => createSlotQueue(0)).toThrow(RangeError)
    expect(() => createSlotQueue(1.5)).toThrow(RangeError)
  })

  it('grants up to the limit immediately, then queues', async () => {
    const q = createSlotQueue(2)
    await q.acquire()
    await q.acquire()
    let third = false
    void q.acquire().then(() => (third = true))
    await tick()
    expect(q.active).toBe(2)
    expect(q.pending).toBe(1)
    expect(third).toBe(false)
  })

  it('serves waiters newest-first (LIFO)', async () => {
    const q = createSlotQueue(1)
    const first = await q.acquire()
    const order: string[] = []
    const a = q.acquire().then((r) => (order.push('a'), r))
    const b = q.acquire().then((r) => (order.push('b'), r))
    const c = q.acquire().then((r) => (order.push('c'), r))
    first()
    ;(await c)()
    ;(await b)()
    ;(await a)()
    expect(order).toEqual(['c', 'b', 'a'])
    expect(q.active).toBe(0)
  })

  it('release is idempotent and never drives active below zero', async () => {
    const q = createSlotQueue(1)
    const release = await q.acquire()
    release()
    release()
    expect(q.active).toBe(0)
    await q.acquire()
    expect(q.active).toBe(1)
  })

  it('rejects at once when the signal is already aborted, taking no slot', async () => {
    const q = createSlotQueue(1)
    const ctrl = new AbortController()
    ctrl.abort(new Error('gone'))
    await expect(q.acquire(ctrl.signal)).rejects.toThrow('gone')
    expect(q.active).toBe(0)
  })

  it('drops a waiter that aborts while queued and does not leak its slot', async () => {
    const q = createSlotQueue(1)
    const first = await q.acquire()
    const ctrl = new AbortController()
    const aborted = q.acquire(ctrl.signal)
    let laterGranted = false
    const later = q.acquire().then((r) => ((laterGranted = true), r))
    ctrl.abort(new Error('scrolled away'))
    await expect(aborted).rejects.toThrow('scrolled away')
    expect(q.pending).toBe(1)
    first()
    ;(await later)()
    expect(laterGranted).toBe(true)
    expect(q.active).toBe(0)
    expect(q.pending).toBe(0)
  })

  it('skips an aborted waiter on the stack top and grants the next one', async () => {
    const q = createSlotQueue(1)
    const first = await q.acquire()
    const ctrl = new AbortController()
    const older = q.acquire()
    const newer = q.acquire(ctrl.signal)
    ctrl.abort()
    await expect(newer).rejects.toBeDefined()
    first()
    const release = await older
    expect(q.active).toBe(1)
    release()
  })
})
