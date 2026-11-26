<script setup lang="ts">
// Decode benchmark. Run `pnpm run gen:bench-samples` first, then `pnpm run bench`.
// Query: kind=doc|photo, n=<images>, mode=grid|scroll|ssr, w=<thumbnail width>,
// run=<id> (makes URLs unique, so every run misses the cache).
//
// - grid: n thumbnails all on screen at once (cold transcode throughput).
// - ssr: like grid, but server-rendered, so the browser requests the images
//   before any page script runs (the first viewport of a normal page load).
// - scroll: a recycling list of `slots` <img>s scrolled fast through n items,
//   then stopped; the recycled <img>s change src, which cancels their requests,
//   as a virtual scroller does.
import { onMounted, ref } from 'vue'

const route = useRoute()
const kind = String(route.query.kind ?? 'doc')
const n = Number(route.query.n ?? 8)
const mode = String(route.query.mode ?? 'grid')
const w = Number(route.query.w ?? 240)
const file = kind === 'photo' ? '/samples/bench/photo-lzw.tif' : '/samples/bench/doc-g4.tif'
const run = String(route.query.run ?? Date.now())
const srcFor = (i: number) => `${file}?bench=${run}-${i}&tpx=1&tpx-w=${w}`

const SLOTS = 6
const ROW = 120
const grid = Array.from({ length: n }, (_, i) => i)
const slots = ref(Array.from({ length: SLOTS }, (_, i) => i))
const first = ref(0)

interface BenchResult {
  loads: Record<string, number>
  errors: string[]
  pings: number[]
}
const result: BenchResult = { loads: {}, errors: [], pings: [] }
;(globalThis as unknown as { __bench: unknown }).__bench = {
  result,
  srcFor,
  // Scroll the recycling list to `to` in `steps` jumps, `every` ms apart.
  async scroll(to: number, steps: number, every: number) {
    for (let s = 1; s <= steps; s++) {
      first.value = Math.round((to * s) / steps)
      slots.value = Array.from({ length: SLOTS }, (_, i) => first.value + i)
      await new Promise((r) => setTimeout(r, every))
    }
    return performance.now()
  },
}

function onLoad(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth > 0) result.loads[img.src] = performance.now()
}
function onError(e: Event) {
  result.errors.push((e.target as HTMLImageElement).src)
}

onMounted(() => {
  const sw = navigator.serviceWorker
  setInterval(() => {
    const controller = sw.controller
    if (!controller) return
    const t = performance.now()
    const ch = new MessageChannel()
    ch.port1.onmessage = () => result.pings.push(performance.now() - t)
    controller.postMessage({ type: 'PING' }, [ch.port2])
  }, 50)
})
</script>

<template>
  <main v-if="mode === 'ssr'" class="grid">
    <img v-for="i in grid" :key="i" :src="srcFor(i)" :width="w" />
  </main>
  <!-- Client-only: SSR'd <img>s would load before @load is attached. -->
  <ClientOnly v-else>
  <main>
    <p data-testid="bench-info">{{ kind }} × {{ n }} ({{ mode }})</p>
    <div v-if="mode === 'grid'" class="grid">
      <img v-for="i in grid" :key="i" :src="srcFor(i)" :width="w" @load="onLoad" @error="onError" />
    </div>
    <div v-else class="list">
      <img
        v-for="(item, slot) in slots"
        :key="slot"
        :src="srcFor(item)"
        :width="w"
        :height="ROW"
        @load="onLoad"
        @error="onError"
      />
    </div>
  </main>
  </ClientOnly>
</template>

<style scoped>
.grid,
.list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
img {
  object-fit: contain;
  background: #eee;
}
</style>
