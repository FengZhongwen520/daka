<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'
import { getCloudToken } from '../../storage'
import { drinkWater, getWater, type WaterState } from '../../services/cloudFeatures'
import { ensureRealtimeConnection, subscribeRealtime } from '../../services/realtime'
import { notify as toast } from '../../utils/feedback'

const DAILY_TARGET = 2000
const DRINK_AMOUNT = 250
const IDLE_WARN_MIN = 60
const IDLE_NOTIFY_MS = 3 * 60 * 1000

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const widgetId = props.widgetId ?? 0

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const today = ref(dateStr(new Date()))
const state = ref<WaterState | null>(null)
const now = ref(Date.now())
const saving = ref(false)
const lastNotifyTime = ref(0)
let idleTimer: ReturnType<typeof setInterval> | null = null
let fallbackPoll: ReturnType<typeof setInterval> | null = null
let unsubscribeRealtime: (() => void) | null = null

const dailyTotal = computed(() => state.value?.totalMl ?? 0)
const lastDrinkTime = computed(() => {
  const value = state.value?.lastDrinkAt
  return value ? new Date(value).getTime() : 0
})
const idleMinutes = computed(() => {
  if (!lastDrinkTime.value) return 0
  return Math.max(0, Math.floor((now.value - lastDrinkTime.value) / 60_000))
})
const status = computed(() => {
  if (dailyTotal.value >= DAILY_TARGET) return 'healthy'
  if (idleMinutes.value >= IDLE_WARN_MIN) return 'idle'
  return 'drinking'
})
const statusLabel = computed(() => {
  switch (status.value) {
    case 'healthy': return '💪 已达标'
    case 'idle': return '⚠️ 该喝水了'
    default: return '💧 饮水'
  }
})
const progress = computed(() => Math.min(dailyTotal.value / DAILY_TARGET, 1))
const cups = computed(() => Math.floor(dailyTotal.value / DRINK_AMOUNT))
const targetCups = DAILY_TARGET / DRINK_AMOUNT

function tokenOrThrow(): string {
  const token = getCloudToken()
  if (!token) throw new Error('饮水组件为云端专属组件，请先登录')
  return token
}

function applyState(next: WaterState) {
  if (next.widgetId !== widgetId || next.date !== today.value) return
  state.value = next
}

async function load() {
  try {
    applyState(await getWater(tokenOrThrow(), widgetId, today.value))
  } catch (reason) {
    toast(reason instanceof Error ? reason.message : '饮水记录加载失败', 'error')
  }
}

let permissionRequested = false
function ensureNotifyPermission() {
  if (permissionRequested) return
  permissionRequested = true
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

function checkIdleNotify() {
  if (status.value !== 'idle') return
  if (now.value - lastNotifyTime.value < IDLE_NOTIFY_MS) return
  lastNotifyTime.value = now.value
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    ensureNotifyPermission()
    return
  }
  try {
    new Notification('💧 该喝水了', {
      body: `已 ${idleMinutes.value} 分钟未喝水，起来喝一杯吧`,
      tag: 'water-idle',
      requireInteraction: true,
    })
  } catch { /* 忽略通知异常 */ }
}

async function drink() {
  if (saving.value) return
  saving.value = true
  try {
    applyState(await drinkWater(
      tokenOrThrow(),
      widgetId,
      today.value,
      DRINK_AMOUNT,
    ))
    now.value = Date.now()
    lastNotifyTime.value = 0
  } catch (reason) {
    toast(reason instanceof Error ? reason.message : '饮水记录保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function handleRealtime(payload: unknown) {
  const next = payload as Partial<WaterState>
  if (
    typeof next.widgetId === 'number'
    && typeof next.date === 'string'
    && typeof next.totalMl === 'number'
  ) {
    applyState(next as WaterState)
  }
}

function rolloverIfNewDay() {
  const day = dateStr(new Date())
  if (day !== today.value) {
    today.value = day
    state.value = null
    lastNotifyTime.value = 0
    void load()
  }
}

onMounted(async () => {
  await load()
  unsubscribeRealtime = subscribeRealtime('water.state', handleRealtime)
  await ensureRealtimeConnection()
  idleTimer = setInterval(() => {
    now.value = Date.now()
    rolloverIfNewDay()
    checkIdleNotify()
  }, 10_000)
  fallbackPoll = setInterval(() => { void load() }, 30_000)
})

onUnmounted(() => {
  unsubscribeRealtime?.()
  if (idleTimer) clearInterval(idleTimer)
  if (fallbackPoll) clearInterval(fallbackPoll)
})

// Drag
const posKey = `water-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 870, 420, true)

// Cup wave height (0-80 for SVG)
const waveHeight = computed(() => progress.value * 80)
</script>

<template>
  <div class="water-tracker widget-card" :class="status" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="header" :on-drag-start="onDragStart" :title="statusLabel" :editable="false" />

    <!-- Cup -->
    <div class="water-body">
      <svg class="cup-svg" viewBox="0 0 120 140">
        <!-- Cup outline -->
        <path
          class="cup-outline"
          d="M25 30 L30 120 Q30 130 40 130 L80 130 Q90 130 90 120 L95 30 Z"
          fill="none"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <!-- Water fill -->
        <clipPath id="cup-clip">
          <path d="M27 35 L32 118 Q32 126 40 126 L80 126 Q88 126 88 118 L93 35 Z" />
        </clipPath>
        <rect
          x="25" width="70" height="130"
          fill="url(#water-grad)"
          clip-path="url(#cup-clip)"
          :y="125 - waveHeight"
          class="water-fill"
        />
        <!-- Wave -->
        <rect
          x="25" width="140" height="6"
          fill="rgba(255,255,255,0.3)"
          clip-path="url(#cup-clip)"
          :y="125 - waveHeight - 3"
          class="wave"
        />
        <!-- Glass shine -->
        <line x1="40" y1="40" x2="40" y2="100" stroke="rgba(255,255,255,0.4)" stroke-width="3" stroke-linecap="round" />
        <!-- Gradient -->
        <defs>
          <linearGradient id="water-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" class="stop-top" />
            <stop offset="100%" class="stop-bottom" />
          </linearGradient>
        </defs>
      </svg>

      <!-- Click to drink -->
      <button class="drink-btn" @click="drink">+</button>
    </div>

    <!-- Stats -->
    <div class="water-stats">
      <div class="water-amount">{{ dailyTotal }} / {{ DAILY_TARGET }} ml</div>
      <div class="water-cups">
        <span v-for="i in targetCups" :key="i" class="cup-dot" :class="{ filled: i <= cups }">🫗</span>
      </div>
      <div v-if="status === 'idle'" class="water-idle-warn">
        已 {{ idleMinutes }} 分钟未喝水
      </div>
    </div>
  </div>
</template>

<style scoped>
.water-tracker {
  position: absolute;
  width: 180px;
  border-radius: var(--radius-md);
  z-index: 57;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 180ms ease, background 0.5s;
}
.water-tracker.idle { background: color-mix(in srgb, var(--status-idle) 7%, var(--widget-glass-bg)); }
.water-tracker.idle :deep(.drag-bar--header) { background: var(--status-idle-soft); }

/* Cup outline — dark-aware stroke */
.cup-outline { stroke: rgba(0, 0, 0, 0.2); }
html.dark .cup-outline { stroke: rgba(255, 255, 255, 0.35); }

/* Water gradient — 3 status palettes via tokens */
.stop-top { stop-color: var(--status-drink); }
.stop-bottom { stop-color: var(--status-drink-dark); }
.water-tracker.idle .stop-top { stop-color: var(--status-idle); }
.water-tracker.idle .stop-bottom { stop-color: var(--status-idle-dark); }
.water-tracker.healthy .stop-top { stop-color: var(--color-primary); }
.water-tracker.healthy .stop-bottom { stop-color: var(--color-primary-hover); }

/* Body */
.water-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}
.cup-svg { width: 100px; height: 116px; }
.water-fill { transition: y 0.5s ease; }

.drink-btn {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--status-drink);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: 0 3px 8px color-mix(in srgb, var(--status-drink) 40%, transparent);
}
.drink-btn:hover { transform: scale(1.1); background: var(--status-drink-dark); }
.drink-btn:active { transform: scale(0.95); }
.water-tracker.idle .drink-btn { background: var(--status-idle); box-shadow: 0 3px 8px color-mix(in srgb, var(--status-idle) 40%, transparent); animation: pulse-btn 1.5s infinite; }
.water-tracker.healthy .drink-btn { background: var(--color-primary); box-shadow: 0 3px 8px color-mix(in srgb, var(--color-primary) 40%, transparent); }

@keyframes pulse-btn {
  0%, 100% { box-shadow: 0 3px 8px color-mix(in srgb, var(--status-idle) 40%, transparent); }
  50% { box-shadow: 0 3px 20px color-mix(in srgb, var(--status-idle) 70%, transparent); }
}

/* Stats */
.water-stats {
  padding: 0 12px 12px;
  text-align: center;
}
.water-amount {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-ink-2);
  margin-bottom: 4px;
}
.water-cups {
  display: flex;
  justify-content: center;
  gap: 2px;
  flex-wrap: wrap;
}
.cup-dot {
  font-size: 12px;
  opacity: 0.2;
  transition: opacity 0.3s;
}
.cup-dot.filled { opacity: 1; }

.water-idle-warn {
  margin-top: 6px;
  font-size: 0.7rem;
  color: var(--status-idle);
  font-weight: 600;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
