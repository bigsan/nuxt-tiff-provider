export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('serviceWorker' in navigator)) return

  async function detectNativeTiff(): Promise<boolean> {
    try {
      const res = await fetch('/native-probe.bin')
      const blob = await res.blob()
      await createImageBitmap(blob)
      return true
    } catch {
      return false
    }
  }

  async function announce(): Promise<void> {
    const value = await detectNativeTiff()
    const reg = await navigator.serviceWorker.ready
    reg.active?.postMessage({ type: 'NATIVE_TIFF', value })
  }

  void announce()
})
