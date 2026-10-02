import { expect, test } from '@playwright/test'

const RGB8 = '/samples/rgb8.tif'
const GRAY16 = '/samples/gray16.tif'
const GROUP4 = '/samples/group4-missing-photometric.tif'

async function naturalWidth(page: import('@playwright/test').Page, testid: string): Promise<number> {
  return page.getByTestId(testid).evaluate((el) => (el as HTMLImageElement).naturalWidth)
}

async function naturalSize(
  page: import('@playwright/test').Page,
  testid: string,
): Promise<{ w: number; h: number }> {
  return page.getByTestId(testid).evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }))
}

test('renders a transcoded TIFF as a painted image', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId(`img-${RGB8}`)).toBeVisible()
  await expect.poll(() => naturalWidth(page, `img-${RGB8}`), { timeout: 20_000 }).toBeGreaterThan(0)
})

test('renders a 16-bit gray TIFF via the geotiff fallback path', async ({ page }) => {
  // gray16.tif is uncompressed 16-bit, so UTIF rejects it and geotiff decodes it.
  // geotiff's decoder registry normally lazy-loads the raw codec with a runtime
  // import(), which is forbidden in a ServiceWorker — without static decoder
  // registration the SW would throw and pass the raw TIFF through, leaving
  // naturalWidth at 0 because the browser can't paint a raw TIFF.
  await page.goto('/')
  await expect(page.getByTestId(`img-${GRAY16}`)).toBeVisible()
  await expect.poll(() => naturalWidth(page, `img-${GRAY16}`), { timeout: 20_000 }).toBeGreaterThan(0)
})

test('main thread stays live during decode (frame counter advances)', async ({ page }) => {
  await page.goto('/')
  const frames = page.getByTestId('frames')
  const first = Number(await frames.textContent())
  await page.waitForTimeout(1000)
  const second = Number(await frames.textContent())
  expect(second).toBeGreaterThan(first)
})

test('second load is served from cache (no raw .tif request on reload)', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => naturalWidth(page, `img-${RGB8}`), { timeout: 20_000 }).toBeGreaterThan(0)

  const rawRequests: string[] = []
  page.on('request', (req) => {
    const u = new URL(req.url())
    if (/\.tiff?$/i.test(u.pathname) && !u.searchParams.has('tpx')) rawRequests.push(u.pathname)
  })

  await page.reload()
  await expect.poll(() => naturalWidth(page, `img-${RGB8}`), { timeout: 20_000 }).toBeGreaterThan(0)
  // A cache hit means the reload is served WebP from the Cache API: the browser
  // must make zero raw `.tif`/`.tiff` requests that lack the `tpx` marker. Any such
  // request would mean the transcode/cache path was bypassed.
  expect(rawRequests.length).toBe(0)
})

// --- This release's fixes ---

test('preserves an existing query string on the source URL', async ({ page }) => {
  // The source already carries `?token=...`; the provider must merge its params
  // into the existing query (not append a second `?`) and the SW must still
  // intercept and transcode. naturalWidth>0 means the whole chain held together.
  await page.goto('/')
  await expect(page.getByTestId('show-query')).toBeVisible()
  await expect.poll(() => naturalWidth(page, 'show-query'), { timeout: 20_000 }).toBeGreaterThan(0)
})

test('honors height — the image is scaled to fit the requested box', async ({ page }) => {
  // A 512×384 source fit into a 320×120 box → 160×120 (aspect preserved). If
  // height were ignored (width-only), naturalHeight would be 240, so the ≤120
  // check is what proves height is actually applied.
  await page.goto('/')
  await expect.poll(() => naturalWidth(page, 'show-height'), { timeout: 20_000 }).toBeGreaterThan(0)
  const { w, h } = await naturalSize(page, 'show-height')
  expect(h).toBeLessThanOrEqual(120)
  expect(w).toBeLessThanOrEqual(320)
})

test('transcodes a cross-origin (CORS) source', async ({ page }) => {
  // show-cors's src is on a different origin (the CORS sample server on :3738).
  // The SW's raw fetch uses mode:'cors', so this only paints if the cross-origin
  // transcode path works end to end.
  await page.goto('/')
  await expect(page.getByTestId('show-cors')).toBeVisible()
  await expect.poll(() => naturalWidth(page, 'show-cors'), { timeout: 20_000 }).toBeGreaterThan(0)
})

test('transcodes the Group 4 drawing with white background and visible ink', async ({ page }) => {
  // The drawing omits photometric metadata. Old UTIF produced a nearly black
  // WebP without throwing, so naturalWidth alone cannot catch this regression.
  const responsePromise = page.waitForResponse((res) => {
    const u = new URL(res.url())
    return u.pathname === GROUP4 && u.searchParams.has('tpx')
  })
  await page.goto('/')
  const response = await responsePromise
  expect(response.headers()['content-type']).toBe('image/webp')
  expect(response.headers()['x-tiff-transcoded']).toBe('1')
  await expect(page.getByTestId('show-group4')).toBeVisible()
  await expect.poll(() => naturalWidth(page, 'show-group4'), { timeout: 20_000 }).toBe(640)
  const { w, h } = await naturalSize(page, 'show-group4')
  expect(w).toBe(640)
  expect(h).toBe(479)

  // Allow resizing and lossy WebP encoding, but require a bright background,
  // visible dark ink, and opaque pixels rather than merely a loadable image.
  const pixels = await page.getByTestId('show-group4').evaluate((el) => {
    const image = el as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let bright = 0
    let dark = 0
    let transparent = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 240 && data[i + 1]! > 240 && data[i + 2]! > 240) bright++
      if (data[i]! < 80 && data[i + 1]! < 80 && data[i + 2]! < 80) dark++
      if (data[i + 3] !== 255) transparent++
    }
    return { bright: bright / (data.length / 4), dark: dark / (data.length / 4), transparent }
  })
  expect(pixels.bright).toBeGreaterThan(0.85)
  expect(pixels.dark).toBeGreaterThan(0.005)
  expect(pixels.dark).toBeLessThan(0.15)
  expect(pixels.transparent).toBe(0)
})
