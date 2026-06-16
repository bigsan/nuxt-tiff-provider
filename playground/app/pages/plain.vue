<script setup lang="ts">
// Deliberately NO service-worker gate here. This page verifies that the module's
// auto-retry (retryRacedImages) makes a plain <NuxtImg> recover on a cold first
// visit. To reproduce a cold start, open this page in an incognito window (or
// unregister the SW first via DevTools → Application → Service Workers).
const samples = [
  { src: '/samples/rgb8.tif', label: '8-bit RGB (UTIF path)' },
  { src: '/samples/gray16.tif', label: '16-bit gray (geotiff path)' },
]
</script>

<template>
  <main class="page">
    <h1>Plain &lt;NuxtImg&gt; — no gate (auto-retry test)</h1>
    <p>
      Open this page in an <b>incognito window</b> to simulate a cold first visit.
      The images should appear on their own, with no refresh — the module re-fetches
      any image that raced the Service Worker once it takes control.
    </p>

    <section class="gallery">
      <figure v-for="s in samples" :key="s.src">
        <NuxtImg
          provider="tiff"
          :src="s.src"
          width="640"
          sizes="100vw md:640px"
          :data-testid="`plain-img-${s.src}`"
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
</style>
