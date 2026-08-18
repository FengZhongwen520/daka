<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  url: string
  fallbackText: string
  fallbackColor: string
}>()

const containerRef = ref<HTMLElement>()

// pending = not yet in viewport; loading = fetching; loaded = success; fallback = timeout or error
const status = ref<'pending' | 'loading' | 'loaded' | 'fallback'>('pending')

let timeoutId: ReturnType<typeof setTimeout> | null = null
let observer: IntersectionObserver | null = null

const src = computed(() => {
  try {
    const u = props.url.startsWith('http') ? props.url : 'https://' + props.url
    return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(u)}&size=48`
  } catch {
    return ''
  }
})

function onLoad() {
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
  status.value = 'loaded'
}

function onError() {
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
  status.value = 'fallback'
}

function startLoading() {
  status.value = 'loading'
  timeoutId = setTimeout(() => {
    // 1s timeout — fall back to default icon
    status.value = 'fallback'
  }, 1000)
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        startLoading()
        observer?.disconnect()
      }
    },
    { rootMargin: '200px' } // start loading when within 200px of viewport
  )

  if (containerRef.value) observer.observe(containerRef.value)
})

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId)
  observer?.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="favicon-wrap">
    <!-- Hidden img that actually triggers the network request -->
    <img
      v-if="status === 'loading' || status === 'loaded'"
      :src="src"
      class="favicon-img"
      :class="{ invisible: status === 'loading' }"
      @load="onLoad"
      @error="onError"
    />

    <!-- Skeleton shimmer shown while loading -->
    <div v-if="status === 'loading'" class="favicon-skeleton" />

    <!-- Fallback: colored initial letter -->
    <span
      v-if="status === 'fallback'"
      class="favicon-fallback"
      :style="{ background: fallbackColor }"
    >{{ fallbackText }}</span>
  </div>
</template>

<style scoped>
.favicon-wrap {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.favicon-img {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  transition: opacity 0.25s ease;
}
.favicon-img.invisible {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

/* Skeleton shimmer animation */
.favicon-skeleton {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--color-border) 25%, var(--color-surface-soft) 50%, var(--color-border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Fallback */
.favicon-fallback {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
