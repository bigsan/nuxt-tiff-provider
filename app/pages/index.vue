<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'

const frames = ref(0)
const fps = ref(0)
const timings = reactive<Record<string, { decode: number; encode: number; total: number }>>({})

const samples = [
  { src: '/samples/rgb8.tif', label: '8-bit RGB (UTIF path)' },
  { src: '/samples/gray16.tif', label: '16-bit gray (geotiff path)' },
]

let rafId = 0
let last = 0
let acc = 0
let count = 0

function loop(t: number): void {
  frames.value++
  if (last) {
    acc += t - last
    count++
    if (acc >= 500) {
      fps.value = Math.round((count / acc) * 1000)
      acc = 0
      count = 0
    }
  }
  last = t
  rafId = requestAnimationFrame(loop)
}

function onMessage(event: MessageEvent): void {
  const data = event.data
  if (
    data?.type === 'TIFF_TIMING' &&
    typeof data.url === 'string' &&
    typeof data.decode === 'number' &&
    typeof data.encode === 'number' &&
    typeof data.total === 'number'
  ) {
    timings[data.url] = { decode: data.decode, encode: data.encode, total: data.total }
  }
}

onMounted(() => {
  rafId = requestAnimationFrame(loop)
  navigator.serviceWorker?.addEventListener('message', onMessage)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  navigator.serviceWorker?.removeEventListener('message', onMessage)
})
</script>

<template>
  <main class="page">
    <h1>Nuxt TIFF Provider — off-main-thread transcode</h1>

    <section class="liveness" data-testid="liveness">
      <span class="spinner" />
      <span>main thread alive — frames: <b data-testid="frames">{{ frames }}</b></span>
      <span>fps: <b data-testid="fps">{{ fps }}</b></span>
    </section>

    <section class="gallery">
      <figure v-for="s in samples" :key="s.src">
        <NuxtImg
          provider="tiff"
          :src="s.src"
          width="640"
          sizes="100vw md:640px"
          :data-testid="`img-${s.src}`"
        />
        <figcaption>
          {{ s.label }}
          <span v-if="timings[s.src]" :data-testid="`timing-${s.src}`">
            · decode {{ timings[s.src].decode.toFixed(0) }}ms · encode
            {{ timings[s.src].encode.toFixed(0) }}ms
          </span>
        </figcaption>
      </figure>
    </section>
  </main>
</template>

<style scoped>
.page {
  font-family: system-ui, sans-serif;
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}
.liveness {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f4f4f5;
  border-radius: 8px;
}
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}
figure {
  margin: 0;
}
:deep(img) {
  width: 100%;
  height: auto;
  border-radius: 8px;
  background: #eee;
}
.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid #c4c4c8;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
