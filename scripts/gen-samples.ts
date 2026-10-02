import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Buffer } from 'node:buffer'
import UTIF from 'utif2'

/** 8-bit RGBA gradient → baseline TIFF (UTIF decode path). */
function makeRgb8(width: number, height: number): ArrayBuffer {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      rgba[i] = Math.round((x / width) * 255)
      rgba[i + 1] = Math.round((y / height) * 255)
      rgba[i + 2] = 128
      rgba[i + 3] = 255
    }
  }
  return UTIF.encodeImage(rgba, width, height)
}

/**
 * 16-bit single-band gradient → baseline little-endian TIFF (forces the
 * geotiff fallback path; UTIF rejects >8-bit).
 *
 * NOTE: geotiff.js's *writer* (`writeArrayBuffer`) is 8-bit only — it sizes the
 * pixel body as `width * height * samplesPerPixel` (one byte/sample) regardless
 * of a `BitsPerSample: [16]` tag, producing a file whose header lies and which
 * `readRasters` cannot decode (RangeError). So we hand-emit a minimal, valid
 * baseline 16-bit TIFF (10 IFD tags + raw 16-bit LE strip) directly.
 */
function makeGray16(width: number, height: number): ArrayBuffer {
  const HEADER = 8
  const ENTRIES = 10
  const ifdBytes = 2 + ENTRIES * 12 + 4 // entry count + entries + next-IFD offset
  const dataOffset = HEADER + ifdBytes
  const bodyBytes = width * height * 2
  const buf = new ArrayBuffer(dataOffset + bodyBytes)
  const dv = new DataView(buf)
  const LE = true
  const SHORT = 3
  const LONG = 4

  // Header: "II", magic 42, IFD0 offset
  dv.setUint8(0, 0x49)
  dv.setUint8(1, 0x49)
  dv.setUint16(2, 42, LE)
  dv.setUint32(4, HEADER, LE)

  // IFD0
  let p = HEADER
  dv.setUint16(p, ENTRIES, LE)
  p += 2
  const entry = (tag: number, type: number, value: number): void => {
    dv.setUint16(p, tag, LE)
    dv.setUint16(p + 2, type, LE)
    dv.setUint32(p + 4, 1, LE) // count
    if (type === SHORT) dv.setUint16(p + 8, value, LE)
    else dv.setUint32(p + 8, value, LE)
    p += 12
  }
  entry(256, SHORT, width) // ImageWidth
  entry(257, SHORT, height) // ImageLength
  entry(258, SHORT, 16) // BitsPerSample
  entry(259, SHORT, 1) // Compression: none
  entry(262, SHORT, 1) // PhotometricInterpretation: BlackIsZero
  entry(273, LONG, dataOffset) // StripOffsets
  entry(277, SHORT, 1) // SamplesPerPixel
  entry(278, LONG, height) // RowsPerStrip
  entry(279, LONG, bodyBytes) // StripByteCounts
  entry(339, SHORT, 1) // SampleFormat: unsigned integer
  dv.setUint32(p, 0, LE) // next IFD = none

  // Pixel body: 16-bit little-endian gradient
  const n = width * height
  for (let i = 0; i < n; i++) {
    dv.setUint16(dataOffset + i * 2, Math.round((i / n) * 65535), LE)
  }
  return buf
}

/**
 * 8-bit CMYK gradient (PhotometricInterpretation: Separated) → baseline
 * little-endian TIFF. Guards utif2's CMYK branch, which reads `window` and so
 * throws wherever there is none (Service Worker, Node).
 *
 * Hand-emitted like `makeGray16`: `UTIF.encodeImage` only writes RGBA. Cyan
 * ramps left→right and magenta top→bottom over a constant 20% black, so a
 * decoder that misreads the inks as RGBA yields alpha 51 instead of 255.
 */
function makeCmyk8(width: number, height: number): ArrayBuffer {
  const HEADER = 8
  const ENTRIES = 9
  const SAMPLES = 4
  const ifdBytes = 2 + ENTRIES * 12 + 4 // entry count + entries + next-IFD offset
  const bitsOffset = HEADER + ifdBytes // BitsPerSample needs 4 SHORTs: out of line
  const dataOffset = bitsOffset + SAMPLES * 2
  const bodyBytes = width * height * SAMPLES
  const buf = new ArrayBuffer(dataOffset + bodyBytes)
  const dv = new DataView(buf)
  const LE = true
  const SHORT = 3
  const LONG = 4

  // Header: "II", magic 42, IFD0 offset
  dv.setUint8(0, 0x49)
  dv.setUint8(1, 0x49)
  dv.setUint16(2, 42, LE)
  dv.setUint32(4, HEADER, LE)

  // IFD0
  let p = HEADER
  dv.setUint16(p, ENTRIES, LE)
  p += 2
  const entry = (tag: number, type: number, value: number, count = 1): void => {
    dv.setUint16(p, tag, LE)
    dv.setUint16(p + 2, type, LE)
    dv.setUint32(p + 4, count, LE)
    // A lone SHORT is stored inline; anything else here is a LONG or an offset.
    if (type === SHORT && count === 1) dv.setUint16(p + 8, value, LE)
    else dv.setUint32(p + 8, value, LE)
    p += 12
  }
  entry(256, SHORT, width) // ImageWidth
  entry(257, SHORT, height) // ImageLength
  entry(258, SHORT, bitsOffset, SAMPLES) // BitsPerSample → [8, 8, 8, 8]
  entry(259, SHORT, 1) // Compression: none
  entry(262, SHORT, 5) // PhotometricInterpretation: Separated (CMYK)
  entry(273, LONG, dataOffset) // StripOffsets
  entry(277, SHORT, SAMPLES) // SamplesPerPixel
  entry(278, LONG, height) // RowsPerStrip
  entry(279, LONG, bodyBytes) // StripByteCounts
  dv.setUint32(p, 0, LE) // next IFD = none

  for (let s = 0; s < SAMPLES; s++) dv.setUint16(bitsOffset + s * 2, 8, LE)

  // Pixel body: C, M, Y, K per pixel
  const body = new Uint8Array(buf, dataOffset)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * SAMPLES
      body[i] = Math.round((x / width) * 255)
      body[i + 1] = Math.round((y / height) * 255)
      body[i + 2] = 0
      body[i + 3] = 51
    }
  }
  return buf
}

function write(path: string, buf: ArrayBuffer): void {
  const abs = resolve(path)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, Buffer.from(buf))
  process.stdout.write(`wrote ${path} (${buf.byteLength} bytes)\n`)
}

function main(): void {
  const rgb8 = makeRgb8(512, 384)
  const gray16 = makeGray16(512, 384)
  const cmyk8 = makeCmyk8(256, 192)

  write('playground/public/samples/rgb8.tif', rgb8)
  write('playground/public/samples/gray16.tif', gray16)
  write('playground/public/samples/cmyk8.tif', cmyk8)
  write('packages/core/test/fixtures/rgb8.tif', rgb8)
  write('packages/core/test/fixtures/gray16.tif', gray16)
  write('packages/core/test/fixtures/cmyk8.tif', cmyk8)

  // Preserve the original Group 4 bytes and missing tags; never re-encode this fixture.
  const drawing = readFileSync(resolve('packages/core/test/fixtures/group4-missing-photometric.tif'))
  write(
    'playground/public/samples/group4-missing-photometric.tif',
    drawing.buffer.slice(drawing.byteOffset, drawing.byteOffset + drawing.byteLength),
  )
}

try {
  main()
} catch (err) {
  process.stderr.write(`${err}\n`)
  process.exit(1)
}
