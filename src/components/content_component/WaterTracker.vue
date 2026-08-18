<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

const DAILY_TARGET = 2000 // ml
const DRINK_AMOUNT = 250   // ml per click
const IDLE_WARN_MIN = 60   // turn yellow after 60 min no drink

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()

// Local-timezone date string (UTC via toISOString would roll the day over at 8am in UTC+8)
function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Load today's data
const today = ref(dateStr(new Date()))
const waterKey = computed(() => `water-${today.value}${props.widgetId != null ? '-' + props.widgetId : ''}`)
const saved = JSON.parse(localStorage.getItem(waterKey.value) || 'null')
const dailyTotal = ref(saved?.total ?? 0)
const lastDrinkTime = ref(saved?.lastDrink ?? 0)
const now = ref(Date.now())

function save() {
  localStorage.setItem(waterKey.value, JSON.stringify({ total: dailyTotal.value, lastDrink: lastDrinkTime.value }))
}

function rolloverIfNewDay() {
  const dayStr = dateStr(new Date())
  if (dayStr !== today.value) {
    today.value = dayStr
    dailyTotal.value = 0
    lastDrinkTime.value = 0
  }
}

// Status
const idleMinutes = computed(() => {
  if (!lastDrinkTime.value) return 0
  return Math.floor((now.value - lastDrinkTime.value) / 60000)
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

// Idle check timer — also handles rolling over to a new local day while the page stays open
let idleTimer: ReturnType<typeof setInterval>
onMounted(() => {
  idleTimer = setInterval(() => {
    now.value = Date.now()
    rolloverIfNewDay()
  }, 10000)
})
onUnmounted(() => clearInterval(idleTimer))

// Drink
function drink() {
  rolloverIfNewDay()
  dailyTotal.value += DRINK_AMOUNT
  lastDrinkTime.value = Date.now()
  now.value = Date.now()
  save()
}

// Drag
const posKey = `water-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 870, 420, true)

// Cup wave height (0-80 for SVG)
const waveHeight = computed(() => progress.value * 80)
</script>

<template>
  <div class="water-tracker" :class="status" :style="{ left: x + 'px', top: y + 'px' }">
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
  background: var(--color-paper);
  border-radius: var(--radius-md);
  box-shadow: 2px 2px 0 var(--color-line), 6px 8px 20px rgba(0,0,0,0.2);
  z-index: 57;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.2s, background 0.5s;
}
.water-tracker.idle { background: color-mix(in srgb, var(--status-idle) 7%, var(--color-paper)); }
.water-tracker.idle :deep(.drag-bar--header) { background: var(--status-idle-soft); }
.water-tracker:hover {
  box-shadow: 2px 2px 0 var(--color-line), 8px 12px 24px rgba(0,0,0,0.25);
}

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
