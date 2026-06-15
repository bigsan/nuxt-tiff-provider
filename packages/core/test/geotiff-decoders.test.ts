import { describe, expect, it } from 'vitest'
import { getDecoder } from 'geotiff'
import { RawDecoder } from '../src/geotiff-decoders'

// geotiff lazy-loads its codec classes via `await import('./raw.js')`, which the
// HTML spec forbids inside a ServiceWorkerGlobalScope (w3c/ServiceWorker#1356).
// Importing `service-worker/geotiff-decoders` must re-register the uncompressed
// slot with a STATIC thunk so `getDecoder` resolves without any runtime import().
describe('geotiff-decoders (static SW registration)', () => {
  it('resolves the Compression=1 slot to our static RawDecoder', async () => {
    const decoder = await getDecoder({ Compression: 1 })
    expect(decoder).toBeInstanceOf(RawDecoder)
  })

  it('also covers the undefined-Compression slot (baseline TIFFs omit the tag)', async () => {
    const decoder = await getDecoder({})
    expect(decoder).toBeInstanceOf(RawDecoder)
  })

  it('passes the strip buffer through unchanged (raw = no codec)', () => {
    const decoder = new RawDecoder()
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer
    expect(decoder.decodeBlock(buffer)).toBe(buffer)
  })
})
