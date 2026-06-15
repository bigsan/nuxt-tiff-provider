import { expect, test } from '@playwright/test'

const RGB8 = '/samples/rgb8.tif'
const GRAY16 = '/samples/gray16.tif'

async function naturalWidth(page: import('@playwright/test').Page, testid: string): Promise<number> {
  return page.getByTestId(testid).evaluate((el) => (el as HTMLImageElement).naturalWidth)
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
    if (/\.tiff?$/i.test(u.pathname) && !u.searchParams.has('fmt')) rawRequests.push(u.pathname)
  })

  await page.reload()
  await expect.poll(() => naturalWidth(page, `img-${RGB8}`), { timeout: 20_000 }).toBeGreaterThan(0)
  // A cache hit means the reload is served WebP from the Cache API: the browser
  // must make zero raw `.tif`/`.tiff` requests that lack the `fmt` param. Any such
  // request would mean the transcode/cache path was bypassed.
  expect(rawRequests.length).toBe(0)
})
