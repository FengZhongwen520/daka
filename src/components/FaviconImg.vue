<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

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
const candidateIndex = ref(0)
const visible = ref(false)

let timeoutId: ReturnType<typeof setTimeout> | null = null
let observer: IntersectionObserver | null = null

const candidates = computed(() => {
  try {
    const parsed = new URL(props.url.startsWith('http') ? props.url : `https://${props.url}`)
    const host = parsed.hostname
    const origin = parsed.origin
    const direct = [
      `${origin}/favicon.ico`,
      `${origin}/apple-touch-icon.png`,
      `${origin}/favicon.png`,
    ]
    const providers = [
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(parsed.href)}&size=64`,
      `https://logo.clearbit.com/${host}?size=64`,
    ]
    return [...new Set([...direct, ...providers])]
  } catch {
    return []
  }
})
const src = computed(() => candidates.value[candidateIndex.value] || '')

function clearTimer() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
}

function armTimer() {
  clearTimer()
  timeoutId = setTimeout(tryNextCandidate, 2200)
}

function tryNextCandidate() {
  clearTimer()
  candidateIndex.value += 1
  if (candidateIndex.value < candidates.value.length) {
    armTimer()
  } else {
    status.value = 'fallback'
  }
}

function onLoad() {
  const image = containerRef.value?.querySelector('img')
  if (!image || image.naturalWidth < 8 || image.naturalHeight < 8) {
    tryNextCandidate()
    return
  }
  clearTimer()
  status.value = 'loaded'
}

function onError() {
  tryNextCandidate()
}

function startLoading() {
  if (candidates.value.length === 0) {
    status.value = 'fallback'
    return
  }
  candidateIndex.value = 0
  status.value = 'loading'
  armTimer()
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    visible.value = true
    startLoading()
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        visible.value = true
        startLoading()
        observer?.disconnect()
      }
    },
    { rootMargin: '200px' } // start loading when within 200px of viewport
  )

  if (containerRef.value) observer.observe(containerRef.value)
})

watch(() => props.url, () => {
  if (visible.value) startLoading()
})

onUnmounted(() => {
  clearTimer()
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
      alt=""
      draggable="false"
      decoding="async"
      referrerpolicy="no-referrer"
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
