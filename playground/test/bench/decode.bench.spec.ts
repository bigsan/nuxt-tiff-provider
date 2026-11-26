import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const RUNS = Number(process.env.BENCH_RUNS ?? 3)
const LABEL = process.env.BENCH_LABEL ?? 'unlabelled'

interface Bench {
  result: { loads: Record<string, number>; errors: string[]; pings: number[] }
  srcFor: (i: number) => string
  scroll: (to: number, steps: number, every: number) => Promise<number>
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN
}
const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]! : NaN
}
const round = (x: number) => Math.round(x)

async function controlled(page: Page): Promise<void> {
  await page.goto('/bench?n=0')
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 })
    .toBe(true)
}

async function waitForLoads(page: Page, srcs: string[], timeout: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((srcs) => {
          const r = (globalThis as unknown as { __bench: Bench }).__bench.result
          return srcs.every((s) => s in r.loads || r.errors.some((e) => e === s))
        }, srcs),
      { timeout, intervals: [100] },
    )
    .toBe(true)
}

const absolute = (page: Page, src: string) => new URL(src, page.url()).href

/** Merge one scenario into bench-results/<label>.json (a failed test restarts the worker, so write as we go). */
function record(name: string, value: unknown): void {
  mkdirSync('bench-results', { recursive: true })
  const path = `bench-results/${LABEL}.json`
  const report = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { label: LABEL, runs: RUNS }
  report[name] = value
  writeFileSync(path, JSON.stringify(report, null, 2))
  console.log(`BENCH ${LABEL} ${name}`, JSON.stringify(value))
}

for (const kind of ['doc', 'photo'] as const) {
  test(`ssr grid (first viewport): ${kind}`, async ({ page }) => {
    const n = kind === 'doc' ? 8 : 24
    const all: number[] = []
    for (let run = 0; run < RUNS; run++) {
      await controlled(page)
      await page.goto(`/bench?kind=${kind}&n=${n}&mode=ssr&run=ssr${Date.now()}`)
      let done = NaN
      await expect
        .poll(
          async () => {
            done = await page.evaluate(() => {
              const imgs = Array.from(document.images)
              return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0) ? performance.now() : NaN
            })
            return Number.isFinite(done)
          },
          { timeout: 3 * 60_000, intervals: [100] },
        )
        .toBe(true)
      all.push(done)
    }
    record(`ssr-grid-${kind}`, { n, allPaintedMs: round(median(all)), raw: { all: all.map(round) } })
  })

  test(`grid: ${kind}`, async ({ page }) => {
    const n = kind === 'doc' ? 8 : 24
    const all: number[] = []
    const pingMax: number[] = []
    const pingP95: number[] = []
    for (let run = 0; run < RUNS; run++) {
      await controlled(page)
      await page.goto(`/bench?kind=${kind}&n=${n}&mode=grid`)
      const srcs = await page.evaluate(
        (n) => Array.from({ length: n }, (_, i) => (globalThis as unknown as { __bench: Bench }).__bench.srcFor(i)),
        n,
      )
      await waitForLoads(page, srcs.map((s) => absolute(page, s)), 3 * 60_000)
      const r = await page.evaluate(() => (globalThis as unknown as { __bench: Bench }).__bench.result)
      expect(r.errors).toEqual([])
      all.push(Math.max(...Object.values(r.loads)))
      pingMax.push(Math.max(...r.pings, 0))
      pingP95.push(p95(r.pings))
    }
    record(`grid-${kind}`, {
      n,
      allPaintedMs: round(median(all)),
      swPingMaxMs: round(median(pingMax)),
      swPingP95Ms: round(median(pingP95)),
      raw: { all: all.map(round), pingMax: pingMax.map(round) },
    })
  })

  test(`scroll: ${kind}`, async ({ page }) => {
    const n = 40
    const stopAt = n - 6
    const settle: number[] = []
    const pingMax: number[] = []
    for (let run = 0; run < RUNS; run++) {
      await controlled(page)
      await page.goto(`/bench?kind=${kind}&n=${n}&mode=scroll`)
      await page.waitForTimeout(300)
      const stopped = await page.evaluate(
        (stopAt) => (globalThis as unknown as { __bench: Bench }).__bench.scroll(stopAt, 17, 60),
        stopAt,
      )
      const srcs = await page.evaluate(
        (stopAt) =>
          Array.from({ length: 6 }, (_, i) => (globalThis as unknown as { __bench: Bench }).__bench.srcFor(stopAt + i)),
        stopAt,
      )
      const abs = srcs.map((s) => absolute(page, s))
      await waitForLoads(page, abs, 3 * 60_000)
      const r = await page.evaluate(() => (globalThis as unknown as { __bench: Bench }).__bench.result)
      settle.push(Math.max(...abs.map((s) => r.loads[s] ?? NaN)) - stopped)
      pingMax.push(Math.max(...r.pings, 0))
    }
    record(`scroll-${kind}`, {
      n,
      lastViewportPaintedAfterStopMs: round(median(settle)),
      swPingMaxMs: round(median(pingMax)),
      raw: { settle: settle.map(round), pingMax: pingMax.map(round) },
    })
  })
}
