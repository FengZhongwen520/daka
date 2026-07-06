<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { weatherData } from '../../store'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

export interface WeatherData {
  temp: number
  code: number
  humidity: number
  windSpeed: number
  location: string
}

const loading = ref(true)
const error = ref('')
const lastUpdate = ref('')
const viewMode = ref<'card' | 'window'>('card')
const testMode = ref(false)

// Test weather codes: clear, cloudy, fog, drizzle, rain, snow, storm
const TEST_CODES = [0, 2, 45, 53, 63, 73, 95]
let testIndex = 0

function toggleTestMode() {
  testMode.value = !testMode.value
  if (!testMode.value) {
    // Exiting test mode — refetch real weather
    fetchWeather()
  }
}

function cycleTestWeather() {
  if (!testMode.value) return
  testIndex = (testIndex + 1) % TEST_CODES.length
  const code = TEST_CODES[testIndex]
  weatherData.value = {
    temp: [28, 22, 15, 18, 14, -2, 20][testIndex],
    code,
    humidity: [40, 60, 85, 75, 90, 80, 95][testIndex],
    windSpeed: [5, 8, 3, 6, 15, 10, 25][testIndex],
    location: '测试模式',
  }
  lastUpdate.value = '🧪测试'
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'card' ? 'window' : 'card'
}

const condition = computed(() => {
  if (!weatherData.value) return 'clear'
  const c = weatherData.value.code
  if (c === 0) return 'clear'
  if (c <= 3) return 'cloudy'
  if (c <= 48) return 'fog'
  if (c <= 67) return 'rain'
  if (c <= 86) return 'snow'
  return 'storm'
})

// Pre-computed random values for particles (stable across renders)
const drops = Array.from({ length: 20 }, () => ({
  left: Math.random() * 100,
  delay: Math.random() * 2,
  dur: 0.5 + Math.random() * 0.5,
}))
const flakes = Array.from({ length: 15 }, () => ({
  left: Math.random() * 100,
  delay: Math.random() * 3,
  size: 8 + Math.random() * 10,
}))

function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫'
  if (code <= 57) return '🌦'
  if (code <= 67) return '🌧'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧'
  if (code <= 86) return '❄️'
  return '⛈'
}

function getWeatherLabel(code: number): string {
  if (code === 0) return '晴朗'
  if (code <= 3) return '多云'
  if (code <= 48) return '雾霾'
  if (code <= 57) return '小雨'
  if (code <= 67) return '大雨'
  if (code <= 77) return '降雪'
  if (code <= 82) return '阵雨'
  if (code <= 86) return '暴雪'
  return '雷暴'
}

function mapWeatherText(text: string): number {
  if (text.includes('晴')) return 0
  if (text.includes('多云') || text.includes('少云')) return 2
  if (text.includes('阴')) return 3
  if (text.includes('雾') || text.includes('霾')) return 45
  if (text.includes('小雨') || text.includes('阵雨')) return 53
  if (text.includes('中雨')) return 63
  if (text.includes('大雨') || text.includes('暴雨')) return 65
  if (text.includes('雷')) return 95
  if (text.includes('雪') || text.includes('小雪')) return 73
  if (text.includes('大雪') || text.includes('暴雪')) return 75
  return 2
}

async function fetchWeather() {
  try {
    loading.value = true
    error.value = ''

    const res = await fetch('https://uapis.cn/api/v1/misc/weather?lang=zh')
    if (!res.ok) throw new Error('API error')
    const data = await res.json()

    weatherData.value = {
      temp: data.temperature,
      code: mapWeatherText(data.weather || '多云'),
      humidity: data.humidity,
      windSpeed: parseInt(data.wind_power) || 0,
      location: data.city || data.district || data.province || '',
    }
    lastUpdate.value = data.report_time || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (e: any) {
    error.value = '获取天气失败'
    weatherData.value = null
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval>
onMounted(() => {
  fetchWeather()
  timer = setInterval(fetchWeather, 10 * 60 * 1000)
})
onUnmounted(() => clearInterval(timer))

// Drag
const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const posKey = `weather-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 40, 480, true)
</script>

<template>
  <div class="weather-fx" :class="{ 'is-window': viewMode === 'window', ['wx-' + condition]: viewMode === 'window' }" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="header" :on-drag-start="onDragStart" title="🌤 天气" :editable="false">
      <button class="wf-toggle" :class="{ active: testMode }" @click="toggleTestMode" :title="testMode ? '关闭测试' : '测试天气'">
        🧪
      </button>
      <button class="wf-toggle wf-window-btn" :class="{ active: viewMode === 'window' }" @click="toggleViewMode" :title="viewMode === 'card' ? '切换窗户视图' : '切换卡片视图'">
        {{ viewMode === 'card' ? '🪟' : '📋' }}
      </button>
    </DragBar>

    <!-- Card view -->
    <div v-if="viewMode === 'card'" class="wf-body">
      <div v-if="loading && !weatherData" class="wf-loading">加载中...</div>
      <div v-else-if="error" class="wf-error-state">
        <span class="wf-error-icon">🌧</span>
        <span>天气获取失败</span>
        <button class="wf-retry-btn" @click="fetchWeather">重试</button>
      </div>
      <template v-else-if="weatherData">
        <div class="wf-main" :class="{ 'test-active': testMode }" @click="cycleTestWeather">
          <span class="wf-icon">{{ getWeatherIcon(weatherData.code) }}</span>
          <span class="wf-temp">{{ weatherData.temp }}°</span>
          <span v-if="testMode" class="test-hint">点击切换</span>
        </div>
        <div class="wf-info">
          <div class="wf-condition">{{ getWeatherLabel(weatherData.code) }}</div>
          <div class="wf-location">📍 {{ weatherData.location }} · {{ lastUpdate }}</div>
          <div class="wf-details">
            <span>💧 {{ weatherData.humidity }}%</span>
            <span>💨 {{ weatherData.windSpeed }} km/h</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Window view -->
    <div v-else class="wf-window">
      <div class="window-frame">
        <div class="window-scene" :class="condition">
          <!-- Sun -->
          <div v-if="condition === 'clear' || condition === 'cloudy'" class="wx-sun" :class="{ 'sun-soft': condition === 'cloudy' }"></div>
          <!-- Clouds -->
          <div v-if="condition === 'cloudy' || condition === 'rain' || condition === 'snow'" class="wx-clouds">
            <div class="cloud c1"></div>
            <div class="cloud c2"></div>
            <div class="cloud c3"></div>
          </div>
          <!-- Rain drops -->
          <div v-if="condition === 'rain' || condition === 'storm'" class="wx-drops">
            <div v-for="(d, i) in drops" :key="i" class="drop" :style="{ left: d.left + '%', animationDelay: d.delay + 's', animationDuration: d.dur + 's' }"></div>
          </div>
          <!-- Snow flakes -->
          <div v-if="condition === 'snow'" class="wx-flakes">
            <div v-for="(f, i) in flakes" :key="i" class="flake" :style="{ left: f.left + '%', animationDelay: f.delay + 's', fontSize: f.size + 'px' }">❄</div>
          </div>
          <!-- Lightning -->
          <div v-if="condition === 'storm'" class="wx-lightning">⚡</div>
          <!-- Fog overlay -->
          <div v-if="condition === 'fog'" class="wx-mist"></div>
          <!-- Ground -->
          <div class="window-ground" :class="condition"></div>
        </div>
        <!-- Window cross bars -->
        <div class="window-cross-h"></div>
        <div class="window-cross-v"></div>
      </div>
      <div class="window-info">
        <span>{{ weatherData?.temp ?? '--' }}°</span>
        <span>{{ weatherData ? getWeatherLabel(weatherData.code) : '--' }}</span>
        <span>{{ weatherData?.location ?? '--' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === Card styles === */
.weather-fx {
  position: absolute;
  width: 190px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.08), 6px 8px 20px rgba(0,0,0,0.15);
  z-index: 58;
  overflow: hidden;
  transition: width 0.3s, height 0.3s;
}
.weather-fx.is-window {
  width: 300px;
}

.wf-toggle {
  width: 22px; height: 22px;
  border: none; background: rgba(0,0,0,0.06);
  border-radius: 50%; cursor: pointer;
  font-size: 12px; display: flex;
  align-items: center; justify-content: center;
  transition: all 0.2s;
}
.wf-toggle:hover { background: rgba(0,0,0,0.12); }
.wf-toggle.active { background: rgba(240,200,0,0.25); box-shadow: 0 0 6px rgba(240,180,0,0.3); }

.wf-window-btn {
  width: 26px; height: 26px;
  font-size: 14px;
  background: rgba(0,0,0,0.08);
  border: 1.5px solid rgba(0,0,0,0.1);
}
.wf-window-btn.active {
  background: rgba(45,180,140,0.2);
  border-color: rgba(45,180,140,0.4);
}

.wf-body { padding: 10px 14px 14px; }
.wf-loading { font-size: 0.8rem; color: #999; text-align: center; padding: 8px 0; }
.wf-error-state {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 0; color: #999; font-size: 0.78rem;
}
.wf-error-icon { font-size: 28px; opacity: 0.5; }
.wf-retry-btn {
  margin-top: 4px; padding: 4px 14px; border: 1px solid #ddd;
  border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.7rem;
  color: #666; transition: all 0.2s; font-family: inherit;
}
.wf-retry-btn:hover { border-color: #2DD4A8; color: #2DD4A8; }
.wf-main { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; position: relative; }
.wf-main.test-active {
  cursor: pointer;
  padding: 4px 6px;
  margin: -4px -6px 2px;
  border-radius: 8px;
  border: 2px dashed #f0c929;
  background: rgba(255,200,40,0.08);
}
.test-hint {
  position: absolute;
  bottom: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.6rem;
  color: #f0c929;
  font-weight: 700;
  white-space: nowrap;
}
.wf-icon { font-size: 36px; }
.wf-temp { font-size: 2.4rem; font-weight: 800; color: #2d3436; line-height: 1; }
.wf-condition { font-size: 0.85rem; font-weight: 700; color: #555; margin-bottom: 2px; }
.wf-location { font-size: 0.7rem; color: #999; margin-bottom: 4px; }
.wf-details { display: flex; gap: 12px; font-size: 0.7rem; color: #aaa; }

/* === Window view === */
.wf-window {
  padding: 0 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.window-frame {
  position: relative;
  width: 100%;
  height: 180px;
  border: 8px solid #5d4037;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.3);
}

.window-scene {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  transition: background 0.8s ease;
}
/* Scene backgrounds */
.window-scene.clear {
  background: linear-gradient(180deg, #4facfe 0%, #7ec8f8 30%, #a8d8ea 60%, #c9e8d4 100%);
}
.window-scene.cloudy {
  background: linear-gradient(180deg, #7eb8da 0%, #a3cce8 30%, #c5dbe8 60%, #c9e8d4 100%);
}
.window-scene.fog {
  background: linear-gradient(180deg, #c8ccd0 0%, #d5d8db 50%, #dde0e3 100%);
}
.window-scene.rain {
  background: linear-gradient(180deg, #37474f 0%, #455a64 40%, #4f5d6b 100%);
}
.window-scene.snow {
  background: linear-gradient(180deg, #90a4ae 0%, #b0bec5 40%, #cfd8dc 100%);
}
.window-scene.storm {
  background: linear-gradient(180deg, #1c252b 0%, #263238 40%, #37474f 100%);
}

/* Sun */
.wx-sun {
  position: absolute;
  top: 15px; right: 25px;
  width: 40px; height: 40px;
  background: radial-gradient(circle, #ffe082 0%, #ffcc02 50%, transparent 70%);
  border-radius: 50%;
  box-shadow: 0 0 30px #ffd54f, 0 0 60px rgba(255,213,80,0.4);
}
.wx-sun.sun-soft {
  opacity: 0.6;
  box-shadow: 0 0 20px #ffd54f, 0 0 40px rgba(255,213,80,0.2);
}

/* Clouds */
.wx-clouds { position: absolute; inset: 0; }
.cloud {
  position: absolute;
  background: rgba(255,255,255,0.85);
  border-radius: 50px;
}
.cloud::before, .cloud::after {
  content: '';
  position: absolute;
  background: inherit;
  border-radius: 50%;
}
.cloud.c1 { width: 60px; height: 20px; top: 20px; left: 15px; animation: drift1 8s ease-in-out infinite; }
.cloud.c2 { width: 50px; height: 16px; top: 40px; left: 120px; animation: drift2 10s ease-in-out infinite; }
.cloud.c3 { width: 70px; height: 22px; top: 10px; left: 180px; animation: drift1 9s ease-in-out infinite; }
@keyframes drift1 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(15px); } }
@keyframes drift2 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-12px); } }

/* Rain drops */
.wx-drops { position: absolute; inset: 0; }
.drop {
  position: absolute;
  top: -10px;
  width: 2px;
  height: 16px;
  background: rgba(210,225,245,0.75);
  animation: fall linear infinite;
}
@keyframes fall { to { transform: translateY(200px); } }

/* Snow flakes */
.wx-flakes { position: absolute; inset: 0; }
.flake {
  position: absolute;
  top: -10px;
  color: rgba(255,255,255,0.8);
  animation: snowfall linear infinite;
}
@keyframes snowfall { to { transform: translateY(200px) rotate(360deg); } }

/* Lightning */
.wx-lightning {
  position: absolute;
  top: -5px; left: 50%;
  font-size: 40px;
  transform: translateX(-50%) rotate(15deg);
  animation: zap 4s infinite;
  filter: drop-shadow(0 0 8px #fff);
}
@keyframes zap {
  0%, 80%, 84%, 100% { opacity: 0; }
  81%, 83% { opacity: 1; }
}

/* Fog */
.wx-mist {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%);
  animation: mist-drift 6s ease-in-out infinite;
}
@keyframes mist-drift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(8px); } }

/* Ground */
.window-ground {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 25px;
  transition: background 0.5s;
}
.window-ground.clear { background: linear-gradient(0deg, #81c784 0%, #a5d6a7 100%); }
.window-ground.cloudy { background: #9e9e9e; }
.window-ground.fog { background: #bdbdbd; }
.window-ground.rain { background: #37474f; }
.window-ground.snow { background: #cfd8dc; }
.window-ground.storm { background: #1c252b; }

/* Window cross bars */
.window-cross-h {
  position: absolute;
  top: 50%; left: 0; right: 0;
  height: 6px;
  background: #5d4037;
  transform: translateY(-50%);
  pointer-events: none;
}
.window-cross-v {
  position: absolute;
  left: 50%; top: 0; bottom: 0;
  width: 6px;
  background: #5d4037;
  transform: translateX(-50%);
  pointer-events: none;
}

/* Window info bar */
.window-info {
  display: flex;
  gap: 10px;
  font-size: 0.75rem;
  color: #666;
  justify-content: center;
}
</style>
