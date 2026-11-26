import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// A throwaway origin that is deliberately NOT the playground's, so the Service
// Worker's cross-origin (CORS) fetch path is exercised end to end. Mimics an
// S3/CDN bucket that serves TIFF with CORS enabled.
const PORT = Number(process.env.CORS_PORT) || 3738
const ROOT = resolve(fileURLToPath(new URL('../playground/public/samples', import.meta.url)))
const TYPES = { '.tif': 'image/tiff', '.tiff': 'image/tiff' }

// Test hooks for the cancellation e2e:
// - `?delay=<ms>` holds the whole response back;
// - `?delayBody=<ms>` sends 200 headers at once and holds the body back, so the
//   page can cancel mid-download;
// - `/garbage.tif` answers 200 with bytes that are not a TIFF;
// - `/__requests` reports, per request URL, whether the client hung up before
//   the response was complete.
const log = []

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { pathname, searchParams } = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (pathname === '/__requests') {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(log))
    return
  }
  const entry = { url: req.url, aborted: false }
  log.push(entry)
  res.on('close', () => {
    if (!res.writableFinished) entry.aborted = true
  })
  const delay = Number(searchParams.get('delay'))
  if (delay > 0) {
    await new Promise((done) => setTimeout(done, delay))
    if (entry.aborted) return
  }
  if (pathname === '/garbage.tif') {
    res.setHeader('Content-Type', 'image/tiff')
    res.end('this is not a tiff')
    return
  }
  const file = resolve(join(ROOT, normalize(pathname)))
  // Path-traversal guard: never serve outside ROOT.
  if (file !== ROOT && !file.startsWith(ROOT + '/')) {
    res.statusCode = 403
    res.end('forbidden')
    return
  }
  try {
    const buf = await readFile(file)
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
    const delayBody = Number(searchParams.get('delayBody'))
    if (delayBody > 0) {
      res.setHeader('Content-Length', String(buf.length))
      res.flushHeaders()
      res.write(buf.subarray(0, 8))
      await new Promise((done) => setTimeout(done, delayBody))
      if (entry.aborted) return
      res.end(buf.subarray(8))
      return
    }
    res.end(buf)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
})

server.listen(PORT, () => {
  console.log(`[cors-samples] serving ${ROOT} with CORS on http://localhost:${PORT}`)
})
