<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, markRaw } from 'vue'
import { selectedProjectId, weatherData } from '../store'
import { getWidgets, addWidget, removeWidget, updateWidgetPos } from '../db'
import { WIDGETS, DEFAULT_WIDGETS } from './calendar/registry'
import type { WidgetInstance } from '../db'

// All widget components
import CalendarBook from './calendar/CalendarBook.vue'
import StickyNote from './calendar/StickyNote.vue'
import PhotoFrame from './calendar/PhotoFrame.vue'
import WeatherFx from './calendar/WeatherFx.vue'
import PomodoroTimer from './calendar/PomodoroTimer.vue'
import WaterTracker from './calendar/WaterTracker.vue'
import WhiteNoise from './calendar/WhiteNoise.vue'
import Bookmarks from './calendar/Bookmarks.vue'
import MemoNote from './calendar/MemoNote.vue'
import WidgetWrapper from './calendar/WidgetWrapper.vue'

const widgetMap: Record<string, any> = {
  calendar: markRaw(CalendarBook),
  sticky: markRaw(StickyNote),
  photoframe: markRaw(PhotoFrame),
  weather: markRaw(WeatherFx),
  pomodoro: markRaw(PomodoroTimer),
  water: markRaw(WaterTracker),
  whitenoise: markRaw(WhiteNoise),
  bookmarks: markRaw(Bookmarks),
  memo: markRaw(MemoNote),
}

// Widget instances
const widgets = ref<WidgetInstance[]>([])

async function loadWidgets() {
  if (!selectedProjectId.value) { widgets.value = []; return }
  widgets.value = await getWidgets(selectedProjectId.value)
}

onMounted(loadWidgets)
watch(selectedProjectId, loadWidgets)

async function onAddWidget(type: string) {
  if (!widgetMap[type] || !selectedProjectId.value) return
  const def = WIDGETS.find(w => w.type === type)
  const id = await addWidget(type, def?.defaultPos.x ?? 400, def?.defaultPos.y ?? 300, selectedProjectId.value)
  widgets.value.push({ id, type, x: def?.defaultPos.x ?? 400, y: def?.defaultPos.y ?? 300, projectId: selectedProjectId.value })
}

async function onRemoveWidget(id: number) {
  await removeWidget(id)
  widgets.value = widgets.value.filter(w => w.id !== id)
}

// Gallery
const showGallery = ref(false)
const selectedType = ref('')

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
  if (isCloudy) for (let i = 0; i < 6; i++) cloudyParticles.push({ x: Math.random() * canvas.width, y: 20 + Math.random() * canvas.height * 0.3, w: 100 + Math.random() * 160, h: 35 + Math.random() * 40, speed: 0.2 + Math.random() * 0.4, opacity: 0.6 + Math.random() * 0.3 })
  const fogParticles: { x: number; y: number; w: number; h: number; speed: number; opacity: number }[] = []
  if (isFog) for (let i = 0; i < 25; i++) fogParticles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, w: 60 + Math.random() * 100, h: 25 + Math.random() * 35, speed: 0.1 + Math.random() * 0.25, opacity: 0.08 + Math.random() * 0.1 })
  const precipCount = isDrizzle ? 80 : isRain ? (isStorm ? 400 : 250) : isSnow ? 100 : 0
  const precipParticles: { x: number; y: number; speed: number; size: number; opacity: number; wind: number }[] = []
  for (let i = 0; i < precipCount; i++) precipParticles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, speed: isDrizzle ? 3 + Math.random() * 4 : isRain ? 10 + Math.random() * 16 : 0.4 + Math.random() * 1.2, size: isDrizzle ? 0.5 + Math.random() * 0.8 : isRain ? 1 + Math.random() * 2 : 2 + Math.random() * 3, opacity: isDrizzle ? 0.2 + Math.random() * 0.3 : 0.3 + Math.random() * 0.5, wind: isDrizzle ? 0.5 + Math.random() * 1 : isRain ? 1.5 + Math.random() * 3 : 0 })

  let lightningAlpha = 0
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const c of cloudyParticles) { ctx.fillStyle = `rgba(255,255,255,${c.opacity})`; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(c.x - c.w * 0.25, c.y - c.h * 0.1, c.w * 0.35, c.h * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(c.x + c.w * 0.2, c.y - c.h * 0.15, c.w * 0.3, c.h * 0.55, 0, 0, Math.PI * 2); ctx.fill(); c.x += c.speed; if (c.x > canvas.width + 200) { c.x = -200; c.y = 20 + Math.random() * canvas.height * 0.3 } }
    for (const f of fogParticles) { ctx.fillStyle = `rgba(225,230,238,${f.opacity})`; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.w / 2, f.h / 2, 0, 0, Math.PI * 2); ctx.fill(); f.x += f.speed; f.y += Math.sin(f.x * 0.004) * 0.3; if (f.x > canvas.width + 100) { f.x = -100; f.y = Math.random() * canvas.height } }
    if (isFog) { ctx.fillStyle = 'rgba(220,225,232,0.06)'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    if (isStorm && Math.random() < 0.005) lightningAlpha = 0.25 + Math.random() * 0.3
    if (lightningAlpha > 0) { ctx.fillStyle = `rgba(255,255,240,${lightningAlpha})`; ctx.fillRect(0, 0, canvas.width, canvas.height); lightningAlpha *= 0.88; if (lightningAlpha < 0.01) lightningAlpha = 0 }
    for (const p of precipParticles) { ctx.beginPath(); if (isDrizzle || isRain) { ctx.strokeStyle = isDrizzle ? `rgba(200,220,240,${p.opacity})` : `rgba(180,210,240,${p.opacity})`; ctx.lineWidth = p.size; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.wind, p.y + p.size * 8); ctx.stroke() } else if (isSnow) { ctx.fillStyle = `rgba(255,255,255,${p.opacity})`; ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill() }; p.y += p.speed; p.x -= p.wind * 0.3; if (isSnow) p.x += Math.sin(p.y * 0.02) * 0.5; if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width } }
    animId = requestAnimationFrame(animate)
  }
  animate()
}

watch(() => weatherData.value?.code, async (code) => { if (code != null) { await nextTick(); startParticles(code) } }, { immediate: true })
onMounted(async () => { if (weatherData.value?.code != null) { await nextTick(); startParticles(weatherData.value.code) } })
onUnmounted(() => cancelAnimationFrame(animId))
</script>

<template>
  <main class="app-main">
    <div v-if="selectedProjectId === null" class="main-empty">
      <span class="empty-icon">👈</span>
      <span class="empty-text">在左侧选择或创建一个打卡项目</span>
    </div>

    <div v-else class="calendar-scene" :class="weatherData ? getWeatherClass(weatherData.code) : ''">
      <canvas v-if="weatherData && weatherData.code >= 1 && weatherData.code <= 99" ref="canvasRef" class="weather-canvas"></canvas>

      <!-- Add widget button -->
      <button class="add-widget-btn" @click="showGallery = true; selectedType = ''" title="添加组件">＋</button>

      <!-- Dynamic widgets -->
      <WidgetWrapper
        v-for="w in widgets"
        :key="w.id"
        :widget-id="w.id!"
        :type="w.type"
        @delete="onRemoveWidget(w.id!)"
      >
        <component :is="widgetMap[w.type]" :widget-id="w.id!" />
      </WidgetWrapper>

      <div class="pen"></div>
    </div>

    <!-- Gallery dialog -->
    <el-dialog v-model="showGallery" title="添加组件" width="520px" :close-on-click-modal="false">
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
.calendar-scene {
  flex: 1; position: relative;
  background: #a4b0be;
  background-image: url('https://www.transparenttextures.com/patterns/dark-wood.png');
  overflow: hidden; min-height: 500px;
  transition: background 1.5s ease, box-shadow 1.5s ease;
}
.calendar-scene.wx-clear { background: radial-gradient(ellipse at 15% 10%, rgba(255,230,120,0.5) 0%, transparent 50%), radial-gradient(ellipse at 80% 5%, rgba(255,240,180,0.35) 0%, transparent 45%), linear-gradient(180deg, #87CEEB 0%, #b8d4e3 40%, #d4c8a8 100%); box-shadow: inset 0 0 120px rgba(255,200,80,0.15); }
.calendar-scene.wx-cloudy { background: radial-gradient(ellipse at 30% 15%, rgba(255,240,160,0.3) 0%, transparent 50%), linear-gradient(180deg, #7eb8da 0%, #a3cce8 30%, #c5dbe8 60%, #d4c8a8 100%); box-shadow: inset 0 0 60px rgba(255,220,120,0.12); }
.calendar-scene.wx-fog { background: linear-gradient(0deg, rgba(200,205,215,0.9) 0%, rgba(215,218,222,0.95) 60%, rgba(225,228,230,0.85) 100%); box-shadow: inset 0 0 100px rgba(255,255,255,0.3); }
.calendar-scene.wx-drizzle { background: linear-gradient(180deg, #748594 0%, #5d6e7d 50%, #4a5a68 100%); box-shadow: inset 0 0 60px rgba(30,40,55,0.4); }
.calendar-scene.wx-rain { background: linear-gradient(180deg, #3d4958 0%, #4a5a6a 50%, #5d6e7d 100%); box-shadow: inset 0 0 100px rgba(20,30,45,0.5); }
.calendar-scene.wx-snow { background: linear-gradient(180deg, #c8d6e5 0%, #dfe6ed 40%, #bcc8d8 100%); box-shadow: inset 0 0 80px rgba(255,255,255,0.4); }
.calendar-scene.wx-storm { background: linear-gradient(180deg, #2d3440 0%, #3d4555 50%, #556270 100%); box-shadow: inset 0 0 120px rgba(20,25,40,0.6); animation: storm-flash 8s infinite; }
@keyframes storm-flash { 0%,90%,92%,96%,100%{box-shadow:inset 0 0 120px rgba(20,25,40,0.6)} 91%,91.5%{box-shadow:inset 0 0 200px rgba(255,255,255,0.4)} 95%,95.3%{box-shadow:inset 0 0 180px rgba(255,255,240,0.3)} }

.weather-canvas { position: absolute; inset: 0; z-index: 999; pointer-events: none; }

.add-widget-btn {
  position: absolute; top: 8px; right: 8px; z-index: 200;
  width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.25);
  backdrop-filter: blur(8px); cursor: pointer;
  font-size: 18px; color: rgba(0,0,0,0.4); font-weight: 300;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.add-widget-btn:hover { background: rgba(255,255,255,0.45); color: #2DD4A8; transform: scale(1.1); }

.gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.gallery-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 16px 8px; border-radius: 12px; cursor: pointer;
  border: 2px solid transparent; background: rgba(0,0,0,0.02);
  transition: all 0.2s;
}
.gallery-item:hover { background: rgba(45,212,168,0.06); border-color: rgba(45,212,168,0.2); }
.gallery-item.selected { background: rgba(45,212,168,0.1); border-color: #2DD4A8; }
.gallery-icon { font-size: 30px; }
.gallery-name { font-size: 0.8rem; font-weight: 700; color: #444; }
.gallery-desc { font-size: 0.65rem; color: #999; text-align: center; line-height: 1.3; }

.pen {
  position: absolute; width: 220px; height: 10px;
  background: linear-gradient(to bottom, #333, #111, #333);
  bottom: 5%; right: 6%; transform: rotate(20deg);
  border-radius: 10px; box-shadow: 12px 20px 30px rgba(0,0,0,0.5);
  z-index: 50; pointer-events: none;
}
@media (max-width: 1000px) { .pen { display: none; } }
</style>
