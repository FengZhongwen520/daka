<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, defineAsyncComponent } from 'vue'
import { selectedProjectId, weatherData, weatherWallpaper, customWallpaper } from '../store/index.ts'
import { getWidgets, addWidget, removeWidget, getWallpaper, saveWallpaper } from '../db/index.ts'
import { WIDGETS } from './content_component/registry.ts'
import type { WidgetInstance } from '../db/index.ts'
import WidgetWrapper from './content_component/WidgetWrapper.vue'

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
  memo: defineAsyncComponent(() => import('./content_component/MemoNote.vue')),
  calculator: defineAsyncComponent(() => import('./content_component/Calculator.vue')),
  searchengine: defineAsyncComponent(() => import('./content_component/SearchEngine.vue')),
  translate: defineAsyncComponent(() => import('./content_component/TranslateBox.vue')),
  fan: defineAsyncComponent(() => import('./content_component/Fan.vue')),
  clock: defineAsyncComponent(() => import('./content_component/ClockWidget.vue')),
  todo: defineAsyncComponent(() => import('./content_component/TodoList.vue')),
}

// Widget instances
const widgets = ref<WidgetInstance[]>([])
const loading = ref(true) // 初始加载中，显示欢迎语

function getCacheKey() { return `widgets-cache-${selectedProjectId.value}` }

async function initWidgets() {
  if (!selectedProjectId.value) { widgets.value = []; loading.value = false; return }

  // 并行：缓存读取 + DB 查询 + 最短显示时间
  const MIN_SHOW = 400 // 欢迎语至少显示 400ms
  const start = Date.now()

  // 1. 先从缓存取，让组件尽快渲染
  const cached = localStorage.getItem(getCacheKey())
  if (cached) {
    try { widgets.value = JSON.parse(cached) } catch { /* ignore */ }
  }

  // 2. 从 DB 加载最新数据
  const fresh = await getWidgets(selectedProjectId.value)
  widgets.value = fresh
  localStorage.setItem(getCacheKey(), JSON.stringify(fresh))

  // 3. 确保最短显示时间
  const elapsed = Date.now() - start
  if (elapsed < MIN_SHOW) {
    await new Promise(r => setTimeout(r, MIN_SHOW - elapsed))
  }

  loading.value = false
}

function updateWidgetCache() {
  localStorage.setItem(getCacheKey(), JSON.stringify(widgets.value))
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
  widgets.value.push({ id, type, x: pos.x, y: pos.y, projectId: selectedProjectId.value })
  updateWidgetCache()
}

async function onRemoveWidget(id: number) {
  await removeWidget(id)
  widgets.value = widgets.value.filter(w => w.id !== id)
  updateWidgetCache()
}

// Gallery
const showGallery = ref(false)
const selectedType = ref('')

// Wallpaper
const sceneBgStyle = computed(() => {
  if (!weatherWallpaper.value && customWallpaper.value) {
    return { backgroundImage: `url(${customWallpaper.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return {}
})

onMounted(async () => {
  customWallpaper.value = await getWallpaper()

  // Resize canvas when sidebar toggles
  const ro = new ResizeObserver(() => {
    const canvas = canvasRef.value
    if (!canvas || !canvas.parentElement) return
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width; canvas.height = rect.height
  })
  ro.observe(document.querySelector('.calendar-scene')!)
  resizeObserver = ro
})

let resizeObserver: ResizeObserver | null = null
onUnmounted(() => { cancelAnimationFrame(animId); resizeObserver?.disconnect() })

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

    <div v-else ref="sceneRef" class="calendar-scene" :class="weatherData && weatherWallpaper ? getWeatherClass(weatherData.code) : ''" :style="sceneBgStyle">
      <canvas v-if="weatherData && weatherData.code >= 1 && weatherData.code <= 99" ref="canvasRef" class="weather-canvas"></canvas>

      <!-- Add widget button -->
      <button class="add-widget-btn" @click="showGallery = true; selectedType = ''" title="添加组件">＋</button>

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
        :key="w.id"
        :widget-id="w.id!"
        :type="w.type"
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

    <!-- Gallery dialog -->
    <el-dialog v-model="showGallery" title="添加组件" width="580px" :close-on-click-modal="false">
      <div class="gallery-grid">
        <div
          v-for="w in WIDGETS"
          :key="w.type"
          class="gallery-item"
          :class="{ selected: selectedType === w.type }"
          @click="selectedType = w.type"
        >
          <span class="gallery-icon">{{ w.icon }}</span>
          <span class="gallery-name">{{ w.name }}</span>
          <span class="gallery-desc">{{ w.desc }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="showGallery = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedType" @click="onAddWidget(selectedType); showGallery = false">添加</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
/* 书桌表面：亚麻纸 + 细密纸纹（自包含，无外部纹理热链） */
.calendar-scene {
  flex: 1; position: relative;
  background-color: var(--scene-linen, #F0ECE4);
  background-image:
    radial-gradient(rgba(31, 36, 48, 0.035) 1px, transparent 1.4px),
    radial-gradient(ellipse at 20% -10%, rgba(255, 255, 255, 0.6) 0%, transparent 55%);
  background-size: 26px 26px, 100% 100%;
  overflow: hidden; min-height: 500px;
  transition: background-color 1.5s ease, box-shadow 1.5s ease;
}
html.dark .calendar-scene {
  background-color: #262A32;
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1.4px),
    radial-gradient(ellipse at 20% -10%, rgba(255, 255, 255, 0.05) 0%, transparent 55%);
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

.gallery-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.gallery-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 16px 8px; border-radius: var(--radius-md); cursor: pointer;
  border: 2px solid transparent; background: rgba(0,0,0,0.02);
  transition: all 0.2s;
}
.gallery-item:hover { background: var(--color-primary-soft); border-color: rgba(45,212,168,0.2); }
.gallery-item.selected { background: var(--color-primary-soft); border-color: var(--color-primary); }
.gallery-icon { font-size: 30px; }
.gallery-name { font-size: 0.8rem; font-weight: 700; color: var(--color-ink-2); }
.gallery-desc { font-size: 0.65rem; color: var(--color-ink-3); text-align: center; line-height: 1.3; }

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
