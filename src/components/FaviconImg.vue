<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  url: string
  fallbackText: string
  fallbackColor: string
  size?: number
}>(), {
  size: 24,
})

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
  <div
    ref="containerRef"
    class="favicon-wrap"
    :style="{ '--favicon-size': `${size}px` }"
  >
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
  width: var(--favicon-size);
  height: var(--favicon-size);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.favicon-img {
  width: var(--favicon-size);
  height: var(--favicon-size);
  border-radius: calc(var(--favicon-size) * 0.22);
  transition: opacity 0.25s ease;
}
.favicon-img.invisible {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

/* Skeleton shimmer animation */
.favicon-skeleton {
  width: var(--favicon-size);
  height: var(--favicon-size);
  border-radius: calc(var(--favicon-size) * 0.22);
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
  width: var(--favicon-size);
  height: var(--favicon-size);
  border-radius: calc(var(--favicon-size) * 0.22);
  color: #fff;
  font-weight: 700;
  font-size: calc(var(--favicon-size) * 0.46);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
