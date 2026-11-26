<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { weatherData, weatherLocationAccuracy, weatherLocationSource } from '../../store'
import {
  refreshWeather,
  setWeatherCity,
  useAutomaticWeatherLocation,
  weatherError,
  weatherLoading,
  weatherUpdatedAt,
} from '../../utils/weather'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

export interface WeatherData {
  temp: number
  code: number
  humidity: number
  windSpeed: number
  location: string
}

const viewMode = ref<'card' | 'window'>('card')
const testMode = ref(false)
const forecastMode = ref<'hourly' | 'daily'>('hourly')
const editingLocation = ref(false)
const cityDraft = ref('')
const locationSaving = ref(false)
const locationEditError = ref('')

// Test weather codes: clear, cloudy, fog, drizzle, rain, snow, storm
const TEST_CODES = [0, 2, 45, 53, 63, 73, 95]
let testIndex = 0

function toggleTestMode() {
  testMode.value = !testMode.value
  if (!testMode.value) {
    // Exiting test mode — refetch real weather
    refreshWeather(true)
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
  weatherUpdatedAt.value = '测试'
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'card' ? 'window' : 'card'
}

function beginLocationEdit() {
  cityDraft.value = weatherData.value?.location || ''
  locationEditError.value = ''
  editingLocation.value = true
}

async function saveCity() {
  const city = cityDraft.value.trim()
  if (!city || locationSaving.value) return
  locationSaving.value = true
  locationEditError.value = ''
  try {
    const updated = await setWeatherCity(city)
    if (updated) {
      editingLocation.value = false
    } else {
      locationEditError.value = '没有找到这个城市'
    }
  } finally {
    locationSaving.value = false
  }
}

async function locateAutomatically() {
  if (locationSaving.value) return
  locationSaving.value = true
  locationEditError.value = ''
  try {
    const updated = await useAutomaticWeatherLocation()
    if (updated) {
      editingLocation.value = false
    } else {
      locationEditError.value = '定位失败，请手动输入城市'
    }
  } finally {
    locationSaving.value = false
  }
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

const locationNotice = computed(() => {
  if (weatherLocationSource.value === 'manual') return ''
  if (weatherLocationSource.value === 'timezone') {
    return '城市来自时区估算，点击修改'
  }
  const accuracy = weatherLocationAccuracy.value
  if (accuracy == null) return '自动定位，点击可修改'
  if (accuracy > 20_000) {
    const distance = accuracy >= 1000
      ? `${Math.round(accuracy / 1000)} km`
      : `${Math.round(accuracy)} m`
    return `定位误差约 ${distance}，点击修改`
  }
  return ''
})

const locationDisplayPrefix = computed(() => {
  if (weatherLocationSource.value === 'timezone') return '估算 · '
  if (weatherLocationSource.value === 'geolocation') return '自动 · '
  return ''
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

function hourLabel(value: string): string {
  return value.slice(11, 16)
}

function dayLabel(value: string, index: number): string {
  if (index === 0) return '今天'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value.slice(5)
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

// Drag
const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const posKey = `weather-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 40, 480, true)

let weatherTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refreshWeather()
  weatherTimer = setInterval(() => refreshWeather(), 10 * 60 * 1000)
})

onUnmounted(() => {
  if (weatherTimer) clearInterval(weatherTimer)
})
</script>

<template>
  <div class="weather-fx widget-card" :class="{ 'is-window': viewMode === 'window', ['wx-' + condition]: viewMode === 'window' }" :style="{ left: x + 'px', top: y + 'px' }">
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
      <div v-if="weatherLoading && !weatherData" class="wf-loading">加载中...</div>
      <div v-else-if="weatherError && !weatherData" class="wf-error-state">
        <span class="wf-error-icon">🌧</span>
        <span>天气获取失败</span>
        <button class="wf-retry-btn" @click="refreshWeather(true)">重试</button>
      </div>
      <template v-else-if="weatherData">
        <div class="wf-main" :class="{ 'test-active': testMode }" @click="cycleTestWeather">
          <span class="wf-icon">{{ getWeatherIcon(weatherData.code) }}</span>
          <span class="wf-temp">{{ weatherData.temp }}°</span>
          <span v-if="testMode" class="test-hint">点击切换</span>
        </div>
        <div class="wf-info">
          <div class="wf-condition">{{ getWeatherLabel(weatherData.code) }}</div>
          <button
            type="button"
            class="wf-location"
            title="设置天气城市"
            @click="beginLocationEdit"
          >
            <span>📍 {{ locationDisplayPrefix }}{{ weatherData.location }} · {{ weatherUpdatedAt }}</span>
            <span class="wf-location-edit">修改</span>
          </button>
          <button
            v-if="locationNotice && !editingLocation"
            type="button"
            class="wf-location-notice"
            @click="beginLocationEdit"
          >{{ locationNotice }}</button>
          <form v-if="editingLocation" class="wf-city-editor" @submit.prevent="saveCity">
            <input
              v-model="cityDraft"
              placeholder="输入城市，例如深圳"
              autocomplete="off"
            />
            <button type="submit" :disabled="locationSaving">保存</button>
            <button type="button" :disabled="locationSaving" @click="locateAutomatically">自动定位</button>
            <button type="button" :disabled="locationSaving" @click="editingLocation = false">取消</button>
            <span v-if="locationEditError">{{ locationEditError }}</span>
          </form>
          <div class="wf-details">
            <span>💧 {{ weatherData.humidity }}%</span>
            <span>💨 {{ weatherData.windSpeed }} km/h</span>
            <span title="Weather data by Open-Meteo">Open-Meteo</span>
          </div>
          <div
            v-if="weatherData.hourly?.length || weatherData.daily?.length"
            class="wf-forecast-section"
          >
            <div class="wf-forecast-tabs" role="tablist" aria-label="天气预报范围">
              <button
                type="button"
                role="tab"
                :aria-selected="forecastMode === 'hourly'"
                :class="{ active: forecastMode === 'hourly' }"
                @click="forecastMode = 'hourly'"
              >逐小时</button>
              <button
                type="button"
                role="tab"
                :aria-selected="forecastMode === 'daily'"
                :class="{ active: forecastMode === 'daily' }"
                @click="forecastMode = 'daily'"
              >未来几天</button>
            </div>
            <div
              v-if="forecastMode === 'hourly' && weatherData.hourly?.length"
              class="wf-hourly"
              aria-label="未来天气"
            >
              <div v-for="hour in weatherData.hourly" :key="hour.time" class="wf-hour">
                <span>{{ hourLabel(hour.time) }}</span>
                <strong>{{ getWeatherIcon(hour.code) }} {{ hour.temp }}°</strong>
                <small>{{ hour.precipitation }}%</small>
              </div>
            </div>
            <div
              v-else-if="forecastMode === 'daily' && weatherData.daily?.length"
              class="wf-daily"
            >
              <div v-for="(day, index) in weatherData.daily" :key="day.date" class="wf-day">
                <span>{{ dayLabel(day.date, index) }}</span>
                <span>{{ getWeatherIcon(day.code) }} {{ getWeatherLabel(day.code) }}</span>
                <strong>{{ day.minTemp }}° / {{ day.maxTemp }}°</strong>
              </div>
            </div>
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
  width: 240px;
  z-index: 58;
  transition: width 0.3s, height 0.3s;
}
.weather-fx.is-window {
  width: 320px;
}

.wf-toggle {
  width: 22px; height: 22px;
  border: none; background: var(--color-surface-soft);
  border-radius: 50%; cursor: pointer;
  font-size: 12px; display: flex;
  align-items: center; justify-content: center;
  transition: all 0.2s;
}
.wf-toggle:hover { background: var(--color-surface); }
.wf-toggle.active { background: var(--status-idle-soft); box-shadow: 0 0 6px color-mix(in srgb, var(--status-idle) 30%, transparent); }

.wf-window-btn {
  width: 26px; height: 26px;
  font-size: 14px;
  background: var(--color-surface-soft);
  border: 1.5px solid var(--color-border);
}
.wf-window-btn.active {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}

.wf-body { padding: 10px 12px 12px; }
.wf-loading { font-size: 0.8rem; color: var(--color-ink-3); text-align: center; padding: 8px 0; }
.wf-error-state {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 0; color: var(--color-ink-3); font-size: 0.78rem;
}
.wf-error-icon { font-size: 28px; opacity: 0.5; }
.wf-retry-btn {
  margin-top: 4px; padding: 4px 14px; border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer; font-size: 0.7rem;
  color: var(--color-ink-2); transition: all 0.2s; font-family: inherit;
}
.wf-retry-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.wf-main { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; position: relative; }
.wf-main.test-active {
  cursor: pointer;
  padding: 4px 6px;
  margin: -4px -6px 2px;
  border-radius: var(--radius-sm);
  border: 2px dashed var(--status-idle);
  background: var(--status-idle-soft);
}
.test-hint {
  position: absolute;
  bottom: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.6rem;
  color: var(--status-idle);
  font-weight: 700;
  white-space: nowrap;
}
.wf-icon { font-size: 36px; }
.wf-temp { font-size: 2.4rem; font-weight: 800; color: var(--color-ink); line-height: 1; }
.wf-condition { font-size: 0.85rem; font-weight: 700; color: var(--color-ink-2); margin-bottom: 2px; }
.wf-location {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.7rem;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.wf-location > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-location-edit {
  flex-shrink: 0;
  color: color-mix(in srgb, var(--color-primary) 62%, var(--color-ink-2));
  font-size: 0.58rem;
  opacity: 0.55;
  transition: opacity 150ms ease;
}
.wf-location:hover .wf-location-edit,
.wf-location:focus-visible .wf-location-edit { opacity: 1; }
.wf-location:hover { color: var(--color-primary); }
.wf-location-notice {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--status-idle-dark) 72%, var(--color-ink-2));
  cursor: pointer;
  font-family: inherit;
  font-size: 0.6rem;
  line-height: 1.35;
  text-align: left;
}
.wf-location-notice:hover { text-decoration: underline; }
.wf-city-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 7px;
}
.wf-city-editor input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  outline: none;
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: inherit;
  font-size: 0.68rem;
}
.wf-city-editor input:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
.wf-city-editor button {
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-ink-2);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.62rem;
}
.wf-city-editor button:hover { border-color: var(--color-primary); color: var(--color-primary); }
.wf-city-editor button:disabled { cursor: wait; opacity: 0.55; }
.wf-city-editor > span { width: 100%; color: var(--color-danger); font-size: 0.6rem; }
.wf-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 0.68rem;
  color: var(--color-ink-3);
}
.wf-details span:last-child { opacity: 0.68; }
.wf-forecast-section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 68%, transparent);
}
.wf-forecast-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  margin-bottom: 7px;
  padding: 3px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-ink) 4%, transparent);
}
.wf-forecast-tabs button {
  min-height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font: 670 0.58rem/1 var(--font-family);
}
.wf-forecast-tabs button.active {
  background: color-mix(in srgb, var(--color-surface) 82%, transparent);
  color: var(--color-primary-hover);
  box-shadow: 0 2px 7px rgba(15, 23, 42, 0.06);
}
.wf-section-title {
  margin-bottom: 6px;
  color: var(--color-ink-3);
  font-size: 0.58rem;
  font-weight: 720;
  letter-spacing: 0.06em;
}
.wf-hourly {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.wf-hourly::-webkit-scrollbar { display: none; }
.wf-hour {
  min-width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 4px;
  border: 1px solid color-mix(in srgb, var(--color-border) 58%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 42%, transparent);
  color: var(--color-ink-2);
  font-size: 0.55rem;
}
.wf-hour strong { font-size: 0.62rem; color: var(--color-ink); white-space: nowrap; }
.wf-hour small { color: var(--status-drink-dark); font-size: 0.52rem; }
.wf-daily { display: flex; flex-direction: column; gap: 4px; }
.wf-day {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: var(--color-ink-2);
  font-size: 0.6rem;
}
.wf-day > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-day strong { color: var(--color-ink); font-size: 0.6rem; font-variant-numeric: tabular-nums; }

/* Dark mode */
html.dark .wf-toggle { background: rgba(255,255,255,0.1); }
html.dark .wf-toggle:hover { background: rgba(255,255,255,0.16); }
html.dark .wf-window-btn { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.16); }

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
  border: 8px solid var(--color-wood);
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
  background: var(--color-wood);
  transform: translateY(-50%);
  pointer-events: none;
}
.window-cross-v {
  position: absolute;
  left: 50%; top: 0; bottom: 0;
  width: 6px;
  background: var(--color-wood);
  transform: translateX(-50%);
  pointer-events: none;
}

/* Window info bar */
.window-info {
  display: flex;
  gap: 10px;
  font-size: 0.75rem;
  color: var(--color-ink-2);
  justify-content: center;
}
</style>
