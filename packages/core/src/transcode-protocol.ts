import type { EncodeOptions } from './encoder'

/** What a transcode needs: the raw TIFF bytes and the output options. */
export interface TranscodeRequest {
  buffer: ArrayBuffer
  opts: EncodeOptions
}

/** A finished transcode, with stage timings in ms. */
export interface TranscodeResult {
  blob: Blob
  decode: number
  encode: number
}

/**
 * The page-side transcoder could not run the job: no page, the worker script
 * failed to load, the worker crashed, the page went away. The SW should decode
 * the bytes itself.
 */
export class TranscodeUnavailableError extends Error {
  override name = 'TranscodeUnavailableError'
}

/** The bytes could not be decoded or encoded. Final: trying again elsewhere would fail too. */
export class TranscodeFailedError extends Error {
  override name = 'TranscodeFailedError'
}

/** Page → worker. */
export interface WorkerJobMessage {
  id: number
  buffer: ArrayBuffer
  opts: EncodeOptions
}

/** Worker → page. */
export type WorkerReplyMessage =
  | { id: number; ok: true; blob: Blob; decode: number; encode: number }
  | { id: number; ok: false; message: string }

/** SW → page (on `navigator.serviceWorker`), with a reply port in `ports[0]`. */
export interface TranscodeAskMessage {
  type: 'TIFF_TRANSCODE'
  buffer: ArrayBuffer
  opts: EncodeOptions
}

/** Page → SW over the reply port. */
export type TranscodeReplyMessage =
  | { ok: true; blob: Blob; decode: number; encode: number }
  | {
      ok: false
      unavailable: boolean
      message: string
      /** The page's pool gave up: the SW should stop asking this page. */
      broken?: boolean
    }

/** SW → page over the reply port: the request was cancelled. */
export interface TranscodeCancelMessage {
  type: 'cancel'
}

/** Page → SW: this page runs a transcode worker pool. */
export const TRANSCODER_READY = 'TIFF_TRANSCODER_READY'
/** SW → pages, after the SW (re)starts: pages with a pool announce themselves again. */
export const TRANSCODER_QUERY = 'TIFF_TRANSCODER_QUERY'
