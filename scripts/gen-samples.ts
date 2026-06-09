import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Buffer } from 'node:buffer'
import UTIF from 'utif'
import { writeArrayBuffer } from 'geotiff'

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
  return UTIF.encodeImage(rgba.buffer, width, height)
}

/** 16-bit single-band gradient → TIFF (forces the geotiff fallback path). */
async function makeGray16(width: number, height: number): Promise<ArrayBuffer> {
  const data = new Uint16Array(width * height)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round((i / data.length) * 65535)
  }
  return writeArrayBuffer(data, {
    width,
    height,
    SamplesPerPixel: 1,
    BitsPerSample: [16],
    SampleFormat: [1],
    PhotometricInterpretation: 1,
  })
}

function write(path: string, buf: ArrayBuffer): void {
  const abs = resolve(path)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, Buffer.from(buf))
  process.stdout.write(`wrote ${path} (${buf.byteLength} bytes)\n`)
}

async function main(): Promise<void> {
  const rgb8 = makeRgb8(512, 384)
  const gray16 = await makeGray16(512, 384)
  const probe = makeRgb8(2, 2)

  write('public/samples/rgb8.tif', rgb8)
  write('public/samples/gray16.tif', gray16)
  write('public/native-probe.bin', probe)
  write('tests/fixtures/rgb8.tif', rgb8)
  write('tests/fixtures/gray16.tif', gray16)
}

main().catch((err) => {
  process.stderr.write(`${err}\n`)
  process.exit(1)
})
