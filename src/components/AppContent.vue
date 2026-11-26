<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, defineAsyncComponent } from 'vue'
import {
  selectedProjectId,
  weatherData,
  weatherWallpaper,
  customWallpaper,
  showLayoutGrid,
  layoutArrangementRequest,
} from '../store/index.ts'
import {
  getWidgets,
  addWidget,
  removeWidget,
  getWallpaper,
  saveWallpaper,
  updateWidgetZ,
  updateWidgetsLayout,
} from '../db/index.ts'
import { WIDGETS } from './content_component/registry.ts'
import type { WidgetInstance } from '../db/index.ts'
import WidgetWrapper from './content_component/WidgetWrapper.vue'
import ContextMenu from './common/ContextMenu.vue'
import { useContextMenu } from '../composables/useContextMenu'
import UiDialog from './common/UiDialog.vue'
import { getItem, setItem } from '../storage'

// Widget components — lazy loaded per type
const widgetMap: Record<string, any> = {
  calendar: defineAsyncComponent(() => import('./content_component/CalendarBook.vue')),
  sticky: defineAsyncComponent(() => import('./content_component/StickyNote.vue')),
  photoframe: defineAsyncComponent(() => import('./content_component/PhotoFrame.vue')),
  weather: defineAsyncComponent(() => import('./content_component/WeatherFx.vue')),
  pomodoro: defineAsyncComponent(() => import('./content_component/PomodoroTimer.vue')),
  water: defineAsyncComponent(() => import('./content_component/WaterTracker.vue')),
  whitenoise: defineAsyncComponent(() => import('./content_component/WhiteNoise.vue')),
  bookmarks: defineAsyncComponent(() => import('./content_component/Bookmarks.vue')),
  'bookmarks-import': defineAsyncComponent(() => import('./content_component/Bookmarks.vue')),
  memo: defineAsyncComponent(() => import('./content_component/MemoNote.vue')),
  calculator: defineAsyncComponent(() => import('./content_component/Calculator.vue')),
  searchengine: defineAsyncComponent(() => import('./content_component/SearchEngine.vue')),
  translate: defineAsyncComponent(() => import('./content_component/TranslateBox.vue')),
  fan: defineAsyncComponent(() => import('./content_component/Fan.vue')),
  clock: defineAsyncComponent(() => import('./content_component/ClockWidget.vue')),
  todo: defineAsyncComponent(() => import('./content_component/TodoList.vue')),
  diary: defineAsyncComponent(() => import('./content_component/DiaryJournal.vue')),
  news: defineAsyncComponent(() => import('./content_component/NewsRadar.vue')),
}

// Widget instances
const widgets = ref<WidgetInstance[]>([])
const loading = ref(true) // 初始加载中，显示欢迎语
const activeWidgetId = ref<number | null>(null)
const overlappingWidgetIds = ref<Set<number>>(new Set())
const layoutVersion = ref(0)
let collisionFrame = 0
let widgetResizeObserver: ResizeObserver | null = null
const observedWidgets = new WeakSet<Element>()

const topZIndex = computed(() => Math.max(0, ...widgets.value.map(widget => widget.zIndex ?? 0)))
const collisionCount = computed(() => overlappingWidgetIds.value.size)

function getCacheKey() { return `widgets-cache-${selectedProjectId.value}` }

async function initWidgets() {
  if (!selectedProjectId.value) { widgets.value = []; loading.value = false; return }

  // Render the cached layout immediately, then reconcile with IndexedDB.
  const cached = getItem(getCacheKey())
  if (cached) {
    try {
      widgets.value = JSON.parse(cached)
      loading.value = false
    } catch { /* ignore */ }
  }

  const fresh = await getWidgets(selectedProjectId.value)
  widgets.value = fresh.map((widget, index) => ({
    ...widget,
    zIndex: Number.isInteger(widget.zIndex) ? widget.zIndex! : index + 1,
  }))
  activeWidgetId.value = [...widgets.value].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0]?.id ?? null
  setItem(getCacheKey(), JSON.stringify(widgets.value))
  loading.value = false
  await nextTick()
  observeWidgetSizes()
  scheduleCollisionCheck()
}

function updateWidgetCache() {
  setItem(getCacheKey(), JSON.stringify(widgets.value))
}

onMounted(initWidgets)
watch(selectedProjectId, () => {
  loading.value = true
  initWidgets()
})

const sceneRef = ref<HTMLElement>()

function getNewWidgetPos(): { x: number; y: number } {
  const el = sceneRef.value
  const w = el?.clientWidth ?? 1000
  // Center horizontally with a small random spread, top-aligned with slight cascade
  const x = w / 2 - 120 + (Math.random() - 0.5) * 200
  const y = 40 + widgets.value.length * 18 + Math.random() * 30
  return { x: Math.round(x), y: Math.round(y) }
}

async function onAddWidget(type: string) {
  if (!widgetMap[type] || !selectedProjectId.value) return
  const pos = getNewWidgetPos()
  const id = await addWidget(type, pos.x, pos.y, selectedProjectId.value)
  const zIndex = topZIndex.value + 1
  widgets.value.push({ id, type, x: pos.x, y: pos.y, projectId: selectedProjectId.value, zIndex })
  activeWidgetId.value = id
  await updateWidgetZ(id, zIndex)
  updateWidgetCache()
  await nextTick()
  observeWidgetSizes()
  scheduleCollisionCheck()
}

async function onRemoveWidget(id: number) {
  await removeWidget(id)
  widgets.value = widgets.value.filter(w => w.id !== id)
  overlappingWidgetIds.value.delete(id)
  if (activeWidgetId.value === id) activeWidgetId.value = null
  updateWidgetCache()
  await nextTick()
  scheduleCollisionCheck()
}

function bringWidgetToFront(id: number) {
  activeWidgetId.value = id
  const widget = widgets.value.find(item => item.id === id)
  if (!widget) return
  const nextZ = topZIndex.value + 1
  if ((widget.zIndex ?? 0) === topZIndex.value) return
  widget.zIndex = nextZ
  void updateWidgetZ(id, nextZ)
  updateWidgetCache()
}

function observeWidgetSizes() {
  const scene = sceneRef.value
  if (!scene || !widgetResizeObserver) return
  scene.querySelectorAll<HTMLElement>('.widget-wrapper > *').forEach((element) => {
    if (observedWidgets.has(element)) return
    observedWidgets.add(element)
    widgetResizeObserver?.observe(element)
  })
}

function scheduleCollisionCheck() {
  if (collisionFrame) cancelAnimationFrame(collisionFrame)
  collisionFrame = requestAnimationFrame(() => {
    collisionFrame = 0
    detectWidgetOverlaps()
  })
}

function detectWidgetOverlaps() {
  const scene = sceneRef.value
  if (!scene) return
  const boxes = Array.from(scene.querySelectorAll<HTMLElement>('.widget-wrapper'))
    .map((wrapper) => {
      const element = wrapper.firstElementChild as HTMLElement | null
      const id = Number(wrapper.dataset.widgetId)
      if (!element || !Number.isInteger(id)) return null
      const rect = element.getBoundingClientRect()
      if (rect.width < 20 || rect.height < 20) return null
      return { id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    })
    .filter((box): box is NonNullable<typeof box> => box != null)

  const next = new Set<number>()
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (overlapX > 8 && overlapY > 8) {
        next.add(a.id)
        next.add(b.id)
      }
    }
  }
  overlappingWidgetIds.value = next
}

async function autoArrangeWidgets() {
  const scene = sceneRef.value
  if (!scene || widgets.value.length === 0) return
  const padding = 28
  const gap = 18
  const availableWidth = Math.max(280, scene.clientWidth - padding * 2)
  const columns = availableWidth >= 1160 ? 3 : availableWidth >= 720 ? 2 : 1
  const columnWidth = (availableWidth - gap * (columns - 1)) / columns
  const columnBottoms = Array.from({ length: columns }, () => padding)

  const arranged = widgets.value.map((widget) => {
    const element = scene.querySelector<HTMLElement>(
      `.widget-wrapper[data-widget-id="${widget.id}"] > *`,
    )
    const width = Math.min(columnWidth, element?.offsetWidth || 240)
    const height = element?.offsetHeight || 200
    const column = columnBottoms.indexOf(Math.min(...columnBottoms))
    const x = Math.round(padding + column * (columnWidth + gap) + Math.max(0, (columnWidth - width) / 2))
    const y = Math.round(columnBottoms[column])
    columnBottoms[column] += height + gap
    return { ...widget, x, y }
  })

  arranged.forEach((widget) => {
    setItem(`widget-layout-${widget.id}`, JSON.stringify({ x: widget.x, y: widget.y }))
  })
  widgets.value = arranged
  layoutVersion.value += 1
  await updateWidgetsLayout(arranged)
  updateWidgetCache()
  await nextTick()
  observeWidgetSizes()
  scheduleCollisionCheck()
}

// Gallery
const showGallery = ref(false)
const selectedType = ref('')
const moreWidgetsOpen = ref(false)
const galleryPrimaryTypes = new Set([
  'bookmarks',
  'bookmarks-import',
  'weather',
  'clock',
  'todo',
  'diary',
  'calculator',
  'searchengine',
  'translate',
  'news',
])
const galleryPrimaryWidgets = computed(() => WIDGETS.filter(widget => galleryPrimaryTypes.has(widget.type)))
const galleryMoreWidgets = computed(() => WIDGETS.filter(widget => !galleryPrimaryTypes.has(widget.type)))

watch(showGallery, (open) => {
  if (open) moreWidgetsOpen.value = false
})

const {
  showMenu: showCanvasMenu,
  menuX: canvasMenuX,
  menuY: canvasMenuY,
  onContextMenu: openCanvasMenu,
  closeMenu: closeCanvasMenu,
} = useContextMenu()

function createWidgetFromMenu() {
  closeCanvasMenu()
  selectedType.value = ''
  showGallery.value = true
}

// Wallpaper
const sceneBgStyle = computed(() => {
  if (!weatherWallpaper.value && customWallpaper.value) {
    return { backgroundImage: `url(${customWallpaper.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return {}
})

onMounted(async () => {
  // Resize canvas when sidebar toggles
  const ro = new ResizeObserver(() => {
    const canvas = canvasRef.value
    if (canvas?.parentElement) {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width = rect.width; canvas.height = rect.height
    }
    scheduleCollisionCheck()
  })
  resizeObserver = ro
  widgetResizeObserver = ro
  if (sceneRef.value) ro.observe(sceneRef.value)
  stopSceneResizeWatch = watch(sceneRef, (scene) => {
    if (!scene) return
    ro.disconnect()
    ro.observe(scene)
  }, { flush: 'post' })

  customWallpaper.value = await getWallpaper()
  await nextTick()
  observeWidgetSizes()
  scheduleCollisionCheck()
  document.addEventListener('pointerup', scheduleCollisionCheck)
})

let resizeObserver: ResizeObserver | null = null
let stopSceneResizeWatch: (() => void) | null = null
onUnmounted(() => {
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  widgetResizeObserver = null
  stopSceneResizeWatch?.()
  if (collisionFrame) cancelAnimationFrame(collisionFrame)
  document.removeEventListener('pointerup', scheduleCollisionCheck)
})

watch(layoutArrangementRequest, () => {
  void autoArrangeWidgets()
})

watch(() => widgets.value.length, async () => {
  await nextTick()
  observeWidgetSizes()
  scheduleCollisionCheck()
})

watch(customWallpaper, async (v) => {
  if (v) await saveWallpaper(v)
})

// Weather effects
const canvasRef = ref<HTMLCanvasElement>()
let animId = 0

function getWeatherClass(code: number): string {
  if (code === 0) return 'wx-clear'
  if (code <= 3) return 'wx-cloudy'
  if (code <= 48) return 'wx-fog'
  if (code <= 57) return 'wx-drizzle'
  if (code <= 67) return 'wx-rain'
  if (code <= 77) return 'wx-snow'
  if (code <= 86) return 'wx-snow'
  return 'wx-storm'
}

function startParticles(code: number) {
  if (animId) cancelAnimationFrame(animId)
  const canvas = canvasRef.value!
  if (!canvas || !canvas.parentElement) return
  const ctx = canvas.getContext('2d')!
  const rect = canvas.parentElement.getBoundingClientRect()
  canvas.width = rect.width; canvas.height = rect.height

  const isCloudy = code >= 1 && code <= 3
  const isFog = code >= 45 && code <= 48
  const isDrizzle = code >= 51 && code <= 57
  const isRain = (code >= 61 && code <= 67) || (code >= 80 && code <= 99)
  const isSnow = code >= 71 && code <= 86
  const isStorm = code >= 95 && code <= 99

  if (!isCloudy && !isFog && !isDrizzle && !isRain && !isSnow) { ctx.clearRect(0, 0, canvas.width, canvas.height); return }

  const cloudyParticles: { x: number; y: number; w: number; h: number; speed: number; opacity: number }[] = []
  if (isCloudy) for (let i = 0; i < 6; i++) cloudyParticles.push({ x: Math.random() * canvas.width, y: 20 + Math.random() * canvas.height * 0.3, w: 100 + Math.random() * 160, h: 35 + Math.random() * 40, speed: 0.2 + Math.random() * 0.4, opacity: 0.2 + Math.random() * 0.2 })
  const fogParticles: { x: number; y: number; w: number; h: number; speed: number; opacity: number }[] = []
  if (isFog) for (let i = 0; i < 35; i++) fogParticles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, w: 80 + Math.random() * 140, h: 30 + Math.random() * 50, speed: 0.08 + Math.random() * 0.2, opacity: 0.12 + Math.random() * 0.15 })
  const precipCount = isDrizzle ? 80 : isRain ? (isStorm ? 400 : 250) : isSnow ? 100 : 0
  const precipParticles: { x: number; y: number; speed: number; size: number; opacity: number; wind: number }[] = []
  for (let i = 0; i < precipCount; i++) precipParticles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, speed: isDrizzle ? 3 + Math.random() * 4 : isRain ? 10 + Math.random() * 16 : 0.4 + Math.random() * 1.2, size: isDrizzle ? 0.5 + Math.random() * 0.8 : isRain ? 1 + Math.random() * 2 : 2 + Math.random() * 3, opacity: isDrizzle ? 0.2 + Math.random() * 0.3 : 0.3 + Math.random() * 0.5, wind: isDrizzle ? 0.5 + Math.random() * 1 : isRain ? 1.5 + Math.random() * 3 : 0 })

  let lightningAlpha = 0
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const c of cloudyParticles) { ctx.fillStyle = `rgba(255,255,255,${c.opacity})`; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(c.x - c.w * 0.25, c.y - c.h * 0.1, c.w * 0.35, c.h * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(c.x + c.w * 0.2, c.y - c.h * 0.15, c.w * 0.3, c.h * 0.55, 0, 0, Math.PI * 2); ctx.fill(); c.x += c.speed; if (c.x > canvas.width + 200) { c.x = -200; c.y = 20 + Math.random() * canvas.height * 0.3 } }
    for (const f of fogParticles) { ctx.fillStyle = `rgba(225,230,238,${f.opacity})`; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.w / 2, f.h / 2, 0, 0, Math.PI * 2); ctx.fill(); f.x += f.speed; f.y += Math.sin(f.x * 0.004) * 0.3; if (f.x > canvas.width + 100) { f.x = -100; f.y = Math.random() * canvas.height } }
    if (isFog) { ctx.fillStyle = 'rgba(220,225,232,0.12)'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    if (isStorm && Math.random() < 0.005) lightningAlpha = 0.25 + Math.random() * 0.3
    if (lightningAlpha > 0) { ctx.fillStyle = `rgba(255,255,240,${lightningAlpha})`; ctx.fillRect(0, 0, canvas.width, canvas.height); lightningAlpha *= 0.88; if (lightningAlpha < 0.01) lightningAlpha = 0 }
    for (const p of precipParticles) { ctx.beginPath(); if (isDrizzle || isRain) { ctx.strokeStyle = isDrizzle ? `rgba(200,220,240,${p.opacity})` : `rgba(180,210,240,${p.opacity})`; ctx.lineWidth = p.size; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.wind, p.y + p.size * 8); ctx.stroke() } else if (isSnow) { ctx.fillStyle = `rgba(255,255,255,${p.opacity})`; ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill() }; p.y += p.speed; p.x -= p.wind * 0.3; if (isSnow) p.x += Math.sin(p.y * 0.02) * 0.5; if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width } }
    animId = requestAnimationFrame(animate)
  }
  animate()
}

watch(() => weatherData.value?.code, async (code) => {
  if (code != null && weatherWallpaper.value) { await nextTick(); startParticles(code) }
  else { if (animId) cancelAnimationFrame(animId); animId = 0 }
}, { immediate: true })

watch(weatherWallpaper, async (on) => {
  if (!on) {
    if (animId) cancelAnimationFrame(animId); animId = 0
    const canvas = canvasRef.value
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  } else if (weatherData.value?.code != null) {
    await nextTick()
    startParticles(weatherData.value.code)
  }
})

</script>

<template>
  <main class="app-main">
    <div v-if="selectedProjectId === null" class="main-empty">
      <span class="empty-icon">👈</span>
      <span class="empty-text">在左侧选择或创建一个打卡项目</span>
    </div>

    <div
      v-else
      ref="sceneRef"
      class="calendar-scene"
      :class="[
        weatherData && weatherWallpaper ? getWeatherClass(weatherData.code) : '',
        { 'show-layout-grid': showLayoutGrid },
      ]"
      :style="sceneBgStyle"
      @contextmenu.self="openCanvasMenu"
    >
      <canvas v-if="weatherData && weatherData.code >= 1 && weatherData.code <= 99" ref="canvasRef" class="weather-canvas"></canvas>

      <!-- Add widget button -->
      <button class="add-widget-btn" @click="showGallery = true; selectedType = ''" title="添加组件">＋</button>

      <button
        v-if="collisionCount > 0"
        type="button"
        class="collision-warning"
        title="点击自动整理布局"
        @click="autoArrangeWidgets"
      >
        <span class="collision-warning-dot" aria-hidden="true" />
        {{ collisionCount }} 个组件重叠 · 点击整理
      </button>

      <!-- Welcome greeting: shown while loading or when no widgets -->
      <div v-if="loading || widgets.length === 0" class="welcome-greeting">
        <span class="greeting-emoji">👋</span>
        <span class="greeting-text">你好</span>
        <span class="greeting-sub" v-if="loading">加载中...</span>
        <span class="greeting-sub" v-else>点击 ＋ 添加你的第一个组件</span>
      </div>

      <!-- Dynamic widgets -->
      <WidgetWrapper
        v-for="w in widgets"
        :key="`${w.id}-${layoutVersion}`"
        :widget-id="w.id!"
        :type="w.type"
        :z-index="w.zIndex ?? 1"
        :active="activeWidgetId === w.id"
        :overlapping="overlappingWidgetIds.has(w.id!)"
        @activate="bringWidgetToFront(w.id!)"
        @delete="onRemoveWidget(w.id!)"
      >
        <component :is="widgetMap[w.type]" :widget-id="w.id!" :initial-x="w.x" :initial-y="w.y" />
      </WidgetWrapper>

      <!-- Signature: a fountain pen resting on the desk -->
      <svg class="pen-svg" viewBox="0 0 200 34" width="150" height="26" aria-hidden="true">
        <path d="M5 17 L33 10.5 L33 23.5 Z" fill="#E6C068" />
        <path d="M33 10.5 L46 17 L33 23.5 Z" fill="#C9A227" />
        <line x1="14" y1="17" x2="42" y2="17" stroke="#7a5a10" stroke-width="1" />
        <rect x="42" y="11" width="108" height="12" rx="5" fill="#2E3440" />
        <rect x="42" y="10.5" width="7" height="13" rx="2.5" fill="#2DD4A8" />
        <rect x="150" y="9.5" width="38" height="15" rx="4" fill="#98A2B3" />
        <path d="M158 9.5 L163 1.5 Q169 -0.5 173 5.5 L169 9.5" fill="none" stroke="#6E7888" stroke-width="2" stroke-linecap="round" />
      </svg>
    </div>

    <ContextMenu :show="showCanvasMenu" :x="canvasMenuX" :y="canvasMenuY">
      <button type="button" class="scene-menu-item" @click="createWidgetFromMenu">
        <span class="scene-menu-icon" aria-hidden="true">＋</span>
        <span>创建组件</span>
      </button>
    </ContextMenu>

    <!-- Gallery dialog -->
    <UiDialog v-model="showGallery" title="组件库" width="620px" :close-on-click-modal="false">
      <div class="gallery-intro">
        <div>
          <span class="gallery-kicker">BUILD YOUR DESK</span>
          <p>选择常用工具，添加到你的工作台。</p>
        </div>
        <span class="gallery-total">{{ WIDGETS.length }} 个组件</span>
      </div>

      <section class="gallery-section" aria-labelledby="primary-widgets-title">
        <div class="gallery-section-head">
          <div>
            <h3 id="primary-widgets-title">常用组件</h3>
            <span>高频入口，优先展示</span>
          </div>
          <span class="gallery-count">{{ galleryPrimaryWidgets.length }}</span>
        </div>
        <div class="gallery-grid">
          <button
            v-for="w in galleryPrimaryWidgets"
            :key="w.type"
            type="button"
            class="gallery-item"
            :class="{ selected: selectedType === w.type }"
            :aria-pressed="selectedType === w.type"
            @click="selectedType = w.type"
          >
            <span class="gallery-icon" aria-hidden="true">{{ w.icon }}</span>
            <span class="gallery-name">{{ w.name }}</span>
            <span class="gallery-desc">{{ w.desc }}</span>
            <span v-if="selectedType === w.type" class="gallery-selected" aria-hidden="true">✓</span>
          </button>
        </div>
      </section>

      <div class="gallery-more" :class="{ 'is-open': moreWidgetsOpen }">
        <button
          type="button"
          class="gallery-more-trigger"
          :aria-expanded="moreWidgetsOpen"
          aria-controls="gallery-more-panel"
          @click="moreWidgetsOpen = !moreWidgetsOpen"
        >
          <span class="gallery-more-icon" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span class="gallery-more-copy">
            <strong>更多组件</strong>
            <small>生活、装饰与进阶工具</small>
          </span>
          <span class="gallery-count">{{ galleryMoreWidgets.length }}</span>
          <svg class="gallery-more-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>

        <div id="gallery-more-panel" class="gallery-more-panel" :inert="!moreWidgetsOpen">
          <div class="gallery-more-clip">
            <div class="gallery-more-body">
              <div class="gallery-grid">
                <button
                  v-for="w in galleryMoreWidgets"
                  :key="w.type"
                  type="button"
                  class="gallery-item"
                  :class="{ selected: selectedType === w.type }"
                  :aria-pressed="selectedType === w.type"
                  @click="selectedType = w.type"
                >
                  <span class="gallery-icon" aria-hidden="true">{{ w.icon }}</span>
                  <span class="gallery-name">{{ w.name }}</span>
                  <span class="gallery-desc">{{ w.desc }}</span>
                  <span v-if="selectedType === w.type" class="gallery-selected" aria-hidden="true">✓</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="ui-button" @click="showGallery = false">取消</button>
        <button
          type="button"
          class="ui-button ui-button-primary"
          :disabled="!selectedType"
          @click="onAddWidget(selectedType); showGallery = false"
        >添加组件</button>
      </template>
    </UiDialog>
  </main>
</template>

<style scoped>
/* 书桌表面：低对比亚麻渐变，让工作区内容成为主体 */
.calendar-scene {
  flex: 1; position: relative;
  background-color: #F1ECE2;
  background-image:
    radial-gradient(ellipse at 18% -12%, rgba(255, 255, 255, 0.48) 0%, transparent 48%),
    radial-gradient(ellipse at 82% 110%, rgba(128, 105, 74, 0.045) 0%, transparent 54%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.14) 0%, rgba(238, 231, 218, 0.06) 100%);
  overflow: hidden; min-height: 500px;
  transition: background-color 1.5s ease, box-shadow 1.5s ease;
}
.calendar-scene.show-layout-grid::after {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgba(45, 212, 168, 0.1) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(45, 212, 168, 0.1) 1px, transparent 1px);
  background-size: 24px 24px;
}
html.dark .calendar-scene {
  background-color: #262A32;
  background-image:
    radial-gradient(ellipse at 18% -12%, rgba(255, 255, 255, 0.055) 0%, transparent 48%),
    radial-gradient(ellipse at 82% 110%, rgba(0, 0, 0, 0.12) 0%, transparent 56%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.025) 0%, rgba(0, 0, 0, 0.035) 100%);
}
/* 天气色调：晴=明亮亚麻纸 / 雨=石板 / 风暴=墨黑 */
.calendar-scene.wx-clear { background: radial-gradient(ellipse at 15% 10%, rgba(255,214,140,0.5) 0%, transparent 55%), radial-gradient(ellipse at 80% 5%, rgba(255,230,170,0.35) 0%, transparent 45%), linear-gradient(180deg, #F3EAD6 0%, #EAE0C9 45%, #DDD0B4 100%); box-shadow: inset 0 0 120px rgba(255,200,80,0.15); }
.calendar-scene.wx-cloudy { background: radial-gradient(ellipse at 30% 15%, rgba(255,240,180,0.3) 0%, transparent 50%), linear-gradient(180deg, #E7E4DE 0%, #D8D5CE 55%, #C7C2B8 100%); box-shadow: inset 0 0 60px rgba(120,120,120,0.12); }
.calendar-scene.wx-fog { background: linear-gradient(0deg, rgba(205,209,214,0.95) 0%, rgba(222,225,229,0.95) 60%, rgba(232,235,238,0.9) 100%); box-shadow: inset 0 0 100px rgba(255,255,255,0.3); }
.calendar-scene.wx-drizzle { background: linear-gradient(180deg, #8A93A3 0%, #6E7888 50%, #5A6472 100%); box-shadow: inset 0 0 60px rgba(30,40,55,0.4); }
.calendar-scene.wx-rain { background: linear-gradient(180deg, #566070 0%, #414A59 50%, #333B48 100%); box-shadow: inset 0 0 100px rgba(20,30,45,0.5); }
.calendar-scene.wx-snow { background: linear-gradient(180deg, #E9E7E2 0%, #DDD9D2 40%, #C9C4BA 100%); box-shadow: inset 0 0 80px rgba(255,255,255,0.4); }
.calendar-scene.wx-storm { background: linear-gradient(180deg, #242A33 0%, #2E3440 50%, #1B2026 100%); box-shadow: inset 0 0 120px rgba(10,15,25,0.7); animation: storm-flash 8s infinite; }
@keyframes storm-flash { 0%,90%,92%,96%,100%{box-shadow:inset 0 0 120px rgba(10,15,25,0.7)} 91%,91.5%{box-shadow:inset 0 0 200px rgba(255,255,255,0.4)} 95%,95.3%{box-shadow:inset 0 0 180px rgba(255,255,240,0.3)} }

.weather-canvas { position: absolute; inset: 0; z-index: 999; pointer-events: none; }

.collision-warning {
  position: absolute;
  z-index: 220;
  top: 46px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, var(--color-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  color: var(--color-danger);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1);
  cursor: pointer;
  font: 650 0.62rem/1 var(--font-family);
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.collision-warning:hover { border-color: var(--color-danger); }
.collision-warning-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 13%, transparent);
}

.add-widget-btn {
  position: absolute; top: 8px; right: 8px; z-index: 200;
  width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.25);
  backdrop-filter: blur(8px); cursor: pointer;
  font-size: 20px; color: rgba(0,0,0,0.4); font-weight: 300;
  display: flex; align-items: center; justify-content: center;
  line-height: 1; padding: 0;
  transition: all 0.2s;
}
.add-widget-btn:hover { background: rgba(255,255,255,0.45); color: var(--color-primary); transform: scale(1.1); }

.scene-menu-item {
  width: 100%;
  min-width: 132px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  text-align: left;
}

.scene-menu-item:hover {
  background: var(--color-primary-soft);
}

.scene-menu-icon {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-primary) 13%, transparent);
  color: color-mix(in srgb, var(--color-primary) 62%, var(--color-ink));
  font-size: 14px;
  line-height: 1;
}

.gallery-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
}
.gallery-kicker {
  display: block;
  margin-bottom: 5px;
  color: var(--color-primary-hover);
  font-size: 0.55rem;
  font-weight: 780;
  letter-spacing: 0.14em;
}
.gallery-intro p { color: var(--color-ink-2); font-size: 0.74rem; line-height: 1.5; }
.gallery-total {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-ink-3);
  font-size: 0.6rem;
  font-weight: 650;
}
.gallery-section { margin-top: 16px; }
.gallery-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.gallery-section-head > div {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.gallery-section-head h3 { color: var(--color-ink); font-size: 0.78rem; font-weight: 760; }
.gallery-section-head > div > span { color: var(--color-ink-3); font-size: 0.62rem; }
.gallery-count {
  min-width: 22px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-ink) 6%, transparent);
  color: var(--color-ink-3);
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.gallery-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.gallery-item {
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-height: 120px; padding: 14px 7px 12px; border-radius: 12px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--color-border) 76%, transparent);
  background: color-mix(in srgb, var(--color-surface) 68%, transparent);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.35) inset;
  color: inherit; font-family: inherit;
  transition:
    transform 160ms ease,
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}
.gallery-item:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--color-primary-soft) 72%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
}
.gallery-item.selected {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--color-primary-soft) 78%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-primary) 72%, var(--color-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 12%, transparent), 0 8px 24px rgba(15, 23, 42, 0.08);
}
.gallery-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  margin-bottom: 2px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-radius: 13px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.72), transparent),
    color-mix(in srgb, var(--color-surface-soft) 68%, transparent);
  box-shadow:
    0 5px 12px rgba(15, 23, 42, 0.07),
    0 1px 0 rgba(255, 255, 255, 0.7) inset;
  font-size: 25px;
  line-height: 1;
}
.gallery-name { font-size: 0.77rem; font-weight: 740; color: var(--color-ink); }
.gallery-desc {
  min-height: 2.4em;
  color: var(--color-ink-3);
  font-size: 0.62rem;
  line-height: 1.2;
  text-align: center;
}
.gallery-selected {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-primary);
  color: #10382f;
  font-size: 0.62rem;
  font-weight: 900;
  box-shadow: 0 3px 8px color-mix(in srgb, var(--color-primary) 36%, transparent);
}
.gallery-more {
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-surface-soft) 50%, transparent);
  overflow: hidden;
}
.gallery-more-trigger {
  width: 100%;
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 160ms ease;
}
.gallery-more-trigger:hover { background: color-mix(in srgb, var(--color-ink) 4%, transparent); }
.gallery-more-icon {
  width: 30px;
  height: 30px;
  display: grid;
  grid-template-columns: repeat(2, 6px);
  place-content: center;
  gap: 3px;
  flex: 0 0 30px;
  border-radius: 9px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.gallery-more-icon i { width: 6px; height: 6px; border-radius: 2px; background: currentColor; }
.gallery-more-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.gallery-more-copy strong { font-size: 0.72rem; font-weight: 740; }
.gallery-more-copy small { color: var(--color-ink-3); font-size: 0.6rem; }
.gallery-more-chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  fill: none;
  stroke: var(--color-ink-3);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: rotate 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.gallery-more.is-open .gallery-more-chevron { rotate: 180deg; }
.gallery-more-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.gallery-more.is-open .gallery-more-panel { grid-template-rows: 1fr; }
.gallery-more-clip { min-height: 0; overflow: hidden; }
.gallery-more-body {
  padding: 2px 10px 10px;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 170ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.gallery-more.is-open .gallery-more-body { opacity: 1; transform: translateY(0); }
html.dark .gallery-item { box-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) inset; }
html.dark .gallery-item:hover,
html.dark .gallery-item.selected { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28); }
html.dark .gallery-icon {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.1), transparent),
    color-mix(in srgb, var(--color-surface-soft) 88%, transparent);
  box-shadow:
    0 5px 14px rgba(0, 0, 0, 0.3),
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

@media (max-width: 560px) {
  .gallery-intro { align-items: flex-start; gap: 10px; }
  .gallery-section-head > div { flex-direction: column; align-items: flex-start; gap: 2px; }
  .gallery-section-head > div > span { display: none; }
  .gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gallery-item { min-height: 112px; }
  .gallery-more-copy small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}

.pen-svg {
  position: absolute; bottom: 4%; right: 6%;
  transform: rotate(18deg);
  filter: drop-shadow(4px 9px 5px rgba(0, 0, 0, 0.35));
  z-index: 50; pointer-events: none;
  opacity: 0.92;
}
@media (max-width: 1000px) { .pen-svg { display: none; } }

/* Welcome greeting */
.welcome-greeting {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; z-index: 30; pointer-events: none;
  animation: greet-in 0.6s ease;
}
.greeting-emoji { font-size: 64px; animation: greet-wave 0.6s ease; }
.greeting-text { font-size: 2rem; font-weight: 700; color: var(--color-ink-2); letter-spacing: 2px; }
.greeting-sub { font-size: 0.85rem; color: var(--color-ink-3); margin-top: 4px; }
@keyframes greet-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes greet-wave { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(20deg); } 50% { transform: rotate(-10deg); } 75% { transform: rotate(15deg); } }
</style>
