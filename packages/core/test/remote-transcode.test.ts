import { afterEach, describe, expect, it } from 'vitest'
import { createRemoteTranscoder, type ClientLike } from '../src/remote-transcode'
import {
  TranscodeFailedError,
  TranscodeUnavailableError,
  type TranscodeAskMessage,
  type TranscodeReplyMessage,
} from '../src/transcode-protocol'

const ports: MessagePort[] = []
afterEach(() => {
  for (const p of ports.splice(0)) p.close()
})

class FakeClient implements ClientLike {
  asks: { message: TranscodeAskMessage; port: MessagePort }[] = []
  cancels = 0
  constructor(public id: string) {}
  postMessage(message: TranscodeAskMessage, transfer: Transferable[]): void {
    const port = transfer[0] as MessagePort
    ports.push(port)
    port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'cancel') this.cancels++
    }
    this.asks.push({ message, port })
  }
  reply(data: TranscodeReplyMessage, i = -1): void {
    this.asks.at(i)!.port.postMessage(data)
  }
}

function setup() {
  const clients = new Map<string, FakeClient>()
  const remote = createRemoteTranscoder({
    getClient: async (id) => clients.get(id),
    livenessIntervalMs: 10,
  })
  const add = (id: string, ready = true) => {
    const c = new FakeClient(id)
    clients.set(id, c)
    if (ready) remote.markReady(id)
    return c
  }
  const request = () => ({ buffer: new Uint8Array([1, 2, 3]).buffer, opts: { targetWidth: 50 } })
  const settle = () => new Promise((r) => setTimeout(r, 0))
  return { remote, clients, add, request, settle }
}

describe('createRemoteTranscoder', () => {
  it('is unavailable when no page has announced a worker pool', async () => {
    const { remote, add, request } = setup()
    add('a', false)
    await expect(remote.transcode('a', request())).rejects.toBeInstanceOf(TranscodeUnavailableError)
  })

  it('asks only the requesting page, keeping a copy of the bytes for a local fallback', async () => {
    const { remote, add, request, settle } = setup()
    const a = add('a')
    const b = add('b')
    const req = request()
    const p = remote.transcode('b', req)
    await settle()
    expect(a.asks).toHaveLength(0)
    expect(b.asks).toHaveLength(1)
    expect(b.asks[0]!.message).toMatchObject({ type: 'TIFF_TRANSCODE', opts: { targetWidth: 50 } })
    expect(req.buffer.byteLength).toBe(3) // not transferred away
    b.reply({ ok: true, blob: new Blob(['webp']), decode: 3, encode: 4 })
    const result = await p
    expect(await result.blob.text()).toBe('webp')
    expect(result).toMatchObject({ decode: 3, encode: 4 })
  })

  it("never sends a page's image to another tab, which may be hidden or frozen", async () => {
    const { remote, add, request, settle } = setup()
    add('a', false)
    const b = add('b')
    await expect(remote.transcode('a', request())).rejects.toBeInstanceOf(TranscodeUnavailableError)
    await expect(remote.transcode(undefined, request())).rejects.toBeInstanceOf(TranscodeUnavailableError)
    await settle()
    expect(b.asks).toHaveLength(0)
  })

  it('stops asking a page whose pool gave up', async () => {
    const { remote, add, request, settle } = setup()
    const a = add('a')
    const p = remote.transcode('a', request())
    await settle()
    a.reply({ ok: false, unavailable: true, broken: true, message: 'workers unavailable' })
    await expect(p).rejects.toBeInstanceOf(TranscodeUnavailableError)
    expect(remote.readyCount).toBe(0)
  })

  it('keeps asking a page after a one-off worker failure', async () => {
    const { remote, add, request, settle } = setup()
    const a = add('a')
    const p = remote.transcode('a', request())
    await settle()
    a.reply({ ok: false, unavailable: true, broken: false, message: 'worker crashed' })
    await expect(p).rejects.toBeInstanceOf(TranscodeUnavailableError)
    expect(remote.readyCount).toBe(1)
  })

  it('skips and forgets a ready page that has gone', async () => {
    const { remote, clients, add, request } = setup()
    add('a')
    clients.delete('a')
    await expect(remote.transcode('a', request())).rejects.toBeInstanceOf(TranscodeUnavailableError)
    expect(remote.readyCount).toBe(0)
  })

  it('maps a page-side transport failure to unavailable and a decode failure to final', async () => {
    const { remote, add, request, settle } = setup()
    const a = add('a')
    const p1 = remote.transcode('a', request())
    await settle()
    a.reply({ ok: false, unavailable: true, message: 'worker 404' })
    await expect(p1).rejects.toBeInstanceOf(TranscodeUnavailableError)

    const p2 = remote.transcode('a', request())
    await settle()
    a.reply({ ok: false, unavailable: false, message: 'bad tiff' })
    await expect(p2).rejects.toBeInstanceOf(TranscodeFailedError)
  })

  it('tells the page to cancel and rejects with the abort reason', async () => {
    const { remote, add, request, settle } = setup()
    const a = add('a')
    const ctrl = new AbortController()
    const p = remote.transcode('a', request(), ctrl.signal)
    await settle()
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await settle()
    expect(a.cancels).toBe(1)
  })

  it('is unavailable when the page goes away mid-transcode', async () => {
    const { remote, clients, add, request, settle } = setup()
    add('a')
    const p = remote.transcode('a', request())
    await settle()
    clients.delete('a')
    await expect(p).rejects.toBeInstanceOf(TranscodeUnavailableError)
    expect(remote.readyCount).toBe(0)
  })

  it('does not time out a long transcode while the page is alive', async () => {
    const { remote, add, request, settle } = setup()
    const a = add('a')
    const p = remote.transcode('a', request())
    await new Promise((r) => setTimeout(r, 80)) // several liveness checks
    await settle()
    a.reply({ ok: true, blob: new Blob(['late']), decode: 0, encode: 0 })
    expect(await (await p).blob.text()).toBe('late')
  })

  it('forget() drops a page', () => {
    const { remote, add } = setup()
    add('a')
    remote.forget('a')
    expect(remote.readyCount).toBe(0)
  })
})
