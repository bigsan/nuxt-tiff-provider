import {
  TranscodeFailedError,
  TranscodeUnavailableError,
  type TranscodeAskMessage,
  type TranscodeCancelMessage,
  type TranscodeReplyMessage,
  type TranscodeRequest,
  type TranscodeResult,
} from './transcode-protocol'

/** The subset of a Service Worker `Client` used here. */
export interface ClientLike {
  id: string
  postMessage(message: TranscodeAskMessage, transfer: Transferable[]): void
}

export interface RemoteTranscoderDeps {
  /** `clients.get(id)`: resolves undefined once the page has gone. */
  getClient: (id: string) => Promise<ClientLike | undefined>
  /** How often to check that the page is still there while it works. Default 1000. */
  livenessIntervalMs?: number
}

export interface RemoteTranscoder {
  /** Record that a page runs a transcode worker pool. */
  markReady(clientId: string): void
  forget(clientId: string): void
  readonly readyCount: number
  /**
   * Transcode on the worker pool of the page that made the request.
   * The SW keeps its own copy of the bytes. Rejects with
   * `TranscodeUnavailableError` (decode locally instead), `TranscodeFailedError`
   * (final), or `signal.reason`. Never times out while the page is alive: a large
   * scan can take seconds.
   */
  transcode(clientId: string | undefined, request: TranscodeRequest, signal?: AbortSignal): Promise<TranscodeResult>
}

export function createRemoteTranscoder(deps: RemoteTranscoderDeps): RemoteTranscoder {
  const ready = new Set<string>()
  const interval = deps.livenessIntervalMs ?? 1000

  // Only the page that made the request: another tab may be hidden or frozen
  // (alive to clients.get, but never answering), which would hold a slot forever.
  async function pick(clientId: string | undefined): Promise<ClientLike | undefined> {
    if (!clientId || !ready.has(clientId)) return undefined
    const client = await deps.getClient(clientId)
    if (!client) ready.delete(clientId)
    return client
  }

  return {
    markReady(clientId) {
      ready.add(clientId)
    },
    forget(clientId) {
      ready.delete(clientId)
    },
    get readyCount() {
      return ready.size
    },
    async transcode(clientId, request, signal) {
      signal?.throwIfAborted()
      const client = await pick(clientId)
      if (!client) throw new TranscodeUnavailableError('no page runs a transcode worker pool')
      signal?.throwIfAborted()

      const channel = new MessageChannel()
      return new Promise<TranscodeResult>((resolve, reject) => {
        let settled = false
        const cleanup = () => {
          settled = true
          clearInterval(timer)
          signal?.removeEventListener('abort', onAbort)
          channel.port1.onmessage = null
          channel.port1.close()
        }
        const onAbort = () => {
          channel.port1.postMessage({ type: 'cancel' } satisfies TranscodeCancelMessage)
          cleanup()
          reject(signal!.reason)
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        channel.port1.onmessage = (event: MessageEvent<TranscodeReplyMessage>) => {
          const data = event.data
          cleanup()
          if (data.ok) resolve({ blob: data.blob, decode: data.decode, encode: data.encode })
          else if (data.unavailable) {
            if (data.broken) ready.delete(client.id)
            reject(new TranscodeUnavailableError(data.message))
          }
          else reject(new TranscodeFailedError(data.message))
        }

        const timer = setInterval(() => {
          void deps.getClient(client.id).then((alive) => {
            if (alive || settled) return
            ready.delete(client.id)
            cleanup()
            reject(new TranscodeUnavailableError('the page running the transcode went away'))
          })
        }, interval)

        // Copy, don't transfer: the SW keeps the bytes for a local fallback.
        client.postMessage({ type: 'TIFF_TRANSCODE', buffer: request.buffer, opts: request.opts }, [
          channel.port2,
        ])
      })
    },
  }
}
