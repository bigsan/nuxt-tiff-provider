/**
 * Scan-sized TIFFs for the decode benchmark (playground /bench). Not used by the
 * test suites. Needs libtiff's `tiffcp` on PATH for the compressed variants:
 *
 *   brew install libtiff   # macOS
 *
 * Writes into playground/public/samples/bench/ (gitignored with the samples).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Buffer } from 'node:buffer'
import UTIF from 'utif2'

const OUT = resolve('playground/public/samples/bench')

/** A photo-like 8-bit RGB image: gradients plus noise, so LZW has real work. */
function photoRgba(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  let seed = 1
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const n = (rand() - 0.5) * 8
      rgba[i] = clamp((x / width) * 255 + n)
      rgba[i + 1] = clamp((y / height) * 255 + n)
      rgba[i + 2] = clamp(128 + 100 * Math.sin((x + y) / 60) + n)
      rgba[i + 3] = 255
    }
  }
  return rgba
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * A scanned-document-like bilevel page (WhiteIsZero, 1 bit, uncompressed):
 * rows of "text" blocks with margins. tiffcp re-encodes it as CCITT Group 4.
 */
function documentTiff(width: number, height: number): ArrayBuffer {
  const rowBytes = Math.ceil(width / 8)
  const body = new Uint8Array(rowBytes * height)
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const margin = Math.round(width * 0.08)
  for (let line = Math.round(height * 0.06); line < height * 0.94; line += 48) {
    let x = margin
    while (x < width - margin) {
      const word = 20 + Math.floor(rand() * 120)
      for (let y = line; y < line + 28 && y < height; y++) {
        for (let xx = x; xx < Math.min(x + word, width - margin); xx++) {
          if (rand() < 0.55) body[y * rowBytes + (xx >> 3)]! |= 0x80 >> (xx & 7)
        }
      }
      x += word + 16 + Math.floor(rand() * 12)
    }
  }

  const ENTRIES = 9
  const HEADER = 8
  const dataOffset = HEADER + 2 + ENTRIES * 12 + 4
  const buf = new ArrayBuffer(dataOffset + body.length)
  const dv = new DataView(buf)
  dv.setUint16(0, 0x4949)
  dv.setUint16(2, 42, true)
  dv.setUint32(4, HEADER, true)
  let p = HEADER
  dv.setUint16(p, ENTRIES, true)
  p += 2
  const entry = (tag: number, type: number, value: number) => {
    dv.setUint16(p, tag, true)
    dv.setUint16(p + 2, type, true)
    dv.setUint32(p + 4, 1, true)
    if (type === 3) dv.setUint16(p + 8, value, true)
    else dv.setUint32(p + 8, value, true)
    p += 12
  }
  entry(256, 4, width)
  entry(257, 4, height)
  entry(258, 3, 1) // BitsPerSample
  entry(259, 3, 1) // Compression: none
  entry(262, 3, 0) // WhiteIsZero
  entry(273, 4, dataOffset) // StripOffsets
  entry(277, 3, 1) // SamplesPerPixel
  entry(278, 4, height) // RowsPerStrip
  entry(279, 4, body.length) // StripByteCounts
  dv.setUint32(p, 0, true)
  new Uint8Array(buf, dataOffset).set(body)
  return buf
}

function write(name: string, buf: ArrayBuffer): string {
  const path = resolve(OUT, name)
  writeFileSync(path, Buffer.from(buf))
  return path
}

function tiffcp(args: string[], from: string, to: string): void {
  execFileSync('tiffcp', [...args, from, to], { stdio: 'inherit' })
  rmSync(from)
  process.stdout.write(`wrote ${to}\n`)
}

function main(): void {
  mkdirSync(OUT, { recursive: true })
  // A photo-sized RGB image and an A4 page scanned at 300 dpi.
  const raw = write('photo.raw.tif', UTIF.encodeImage(photoRgba(1600, 1200), 1600, 1200))
  tiffcp(['-c', 'lzw', '-r', '64'], raw, resolve(OUT, 'photo-lzw.tif'))
  const doc = write('doc.raw.tif', documentTiff(2480, 3508))
  tiffcp(['-c', 'g4'], doc, resolve(OUT, 'doc-g4.tif'))
}

main()
