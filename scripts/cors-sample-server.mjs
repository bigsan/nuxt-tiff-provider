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

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`)
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
    res.end(buf)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
})

server.listen(PORT, () => {
  console.log(`[cors-samples] serving ${ROOT} with CORS on http://localhost:${PORT}`)
})
