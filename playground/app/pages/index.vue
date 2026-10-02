<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from "vue";

const frames = ref(0);
const fps = ref(0);
const timings = reactive<
  Record<string, { decode: number; encode: number; total: number }>
>({});
const swReady = ref(false);

const samples = [
  { src: "/samples/rgb8.tif", label: "8-bit RGB (UTIF path)" },
  { src: "/samples/gray16.tif", label: "16-bit gray (geotiff path)" },
];

// The query-param namespace is configurable; the playground runs a non-default
// prefix to prove the whole chain (provider → SW registration → SW) honors it.
const paramPrefix = useRuntimeConfig().public.tiff?.paramPrefix ?? "tp";

// A second origin (run `pnpm run cors:samples`) serving the same TIFF with CORS,
// to demo the cross-origin transcode path.
const CORS_ORIGIN = "http://localhost:3738";

// Cases that exercise this release's fixes.
const showcase = [
  {
    key: "group4",
    src: "/samples/group4-missing-photometric.tif",
    label: "CCITT Group 4 drawing — missing photometric metadata (utif2)",
    width: 640,
    height: undefined as number | undefined,
  },
  {
    key: "cmyk",
    src: "/samples/cmyk8.tif",
    label: "CMYK (Separated) — decoded in the Service Worker, where utif2 finds no window",
    width: 640,
    height: undefined as number | undefined,
  },
  {
    key: "query",
    src: "/samples/rgb8.tif?token=demo-signed-abc123",
    label:
      "Existing query string (signed-URL style) — preserved, interception intact",
    width: 640,
    height: undefined as number | undefined,
  },
  {
    key: "height",
    src: "/samples/rgb8.tif",
    label: "Fit inside 320×120 (height honored, aspect preserved)",
    width: 320,
    height: 120 as number | undefined,
  },
  {
    key: "cors",
    src: `${CORS_ORIGIN}/rgb8.tif`,
    label: "Cross-origin source (CORS) — transcoded via mode:cors",
    width: 640,
    height: undefined as number | undefined,
  },
];

let rafId = 0;
let last = 0;
let acc = 0;
let count = 0;

function loop(t: number): void {
  frames.value++;
  if (last) {
    acc += t - last;
    count++;
    if (acc >= 500) {
      fps.value = Math.round((count / acc) * 1000);
      acc = 0;
      count = 0;
    }
  }
  last = t;
  rafId = requestAnimationFrame(loop);
}

function onMessage(event: MessageEvent): void {
  const data = event.data;
  if (
    data?.type === "TIFF_TIMING" &&
    typeof data.url === "string" &&
    typeof data.decode === "number" &&
    typeof data.encode === "number" &&
    typeof data.total === "number"
  ) {
    timings[data.url] = {
      decode: data.decode,
      encode: data.encode,
      total: data.total,
    };
  }
}

async function gateOnServiceWorker(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) {
      swReady.value = true;
      return;
    }
    if (navigator.serviceWorker.controller) {
      swReady.value = true;
      return;
    }
    // Cold visit: add controllerchange listener BEFORE any await to avoid missing the event
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        swReady.value = true;
      },
      { once: true },
    );
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) {
      swReady.value = true;
    }
  } catch (err) {
    // Fail open: if service-worker probing throws (e.g. `.ready` rejects in an
    // unexpected environment), render the images ungated rather than leaving the
    // gate stuck closed. Surface the cause — do not swallow it silently. This is a
    // single catch-all on an exceptional path, not routine logging, so it is
    // consistent with the service worker's sanctioned console.warn usage.
    console.warn("[tiff] service-worker gate failed, rendering ungated:", err);
    swReady.value = true;
  }
}

onMounted(() => {
  rafId = requestAnimationFrame(loop);
  navigator.serviceWorker?.addEventListener("message", onMessage);
  void gateOnServiceWorker();
});

onUnmounted(() => {
  cancelAnimationFrame(rafId);
  navigator.serviceWorker?.removeEventListener("message", onMessage);
});
</script>

<template>
  <main class="page">
    <h1>Nuxt TIFF Provider — off-main-thread transcode</h1>

    <section class="liveness" data-testid="liveness">
      <span class="spinner" />
      <span
        >main thread alive — frames:
        <b data-testid="frames">{{ frames }}</b></span
      >
      <span
        >fps: <b data-testid="fps">{{ fps }}</b></span
      >
    </section>

    <p class="note" data-testid="prefix">
      <code>paramPrefix</code>: <b>{{ paramPrefix }}</b>
      — a custom namespace, proving it is configurable end to end.
    </p>

    <h2>Baseline</h2>
    <section class="gallery">
      <figure v-for="s in samples" :key="s.src">
        <NuxtImg
          v-if="swReady"
          provider="tiff"
          :src="s.src"
          width="640"
          sizes="100vw md:640px"
          :data-testid="`img-${s.src}`"
        />
        <figcaption>
          {{ s.label }}
          <span v-if="timings[s.src]" :data-testid="`timing-${s.src}`">
            · decode {{ timings[s.src]!.decode.toFixed(0) }}ms · encode
            {{ timings[s.src]!.encode.toFixed(0) }}ms
          </span>
        </figcaption>
      </figure>
    </section>

    <h2>This release</h2>
    <section class="gallery">
      <figure v-for="s in showcase" :key="s.key">
        <NuxtImg
          v-if="swReady"
          provider="tiff"
          :src="s.src"
          :width="s.width"
          :height="s.height"
          :data-testid="`show-${s.key}`"
        />
        <figcaption>{{ s.label }}</figcaption>
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
  margin-top: 1rem;
}
h2 {
  margin-top: 2rem;
  font-size: 1.1rem;
}
.note {
  margin-top: 1.5rem;
  padding: 0.75rem 1rem;
  background: #eef2ff;
  border-radius: 8px;
  font-size: 0.9rem;
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
