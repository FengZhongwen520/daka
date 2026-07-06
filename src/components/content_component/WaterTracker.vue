<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const DAILY_TARGET = 2000 // ml
const DRINK_AMOUNT = 250   // ml per click
const IDLE_WARN_MIN = 60   // turn yellow after 60 min no drink

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()

// Load today's data
const today = new Date().toISOString().slice(0, 10)
const waterKey = `water-${today}${props.widgetId != null ? '-' + props.widgetId : ''}`
const saved = JSON.parse(localStorage.getItem(waterKey) || 'null')
const dailyTotal = ref(saved?.total ?? 0)
const lastDrinkTime = ref(saved?.lastDrink ?? 0)
const now = ref(Date.now())

function save() {
  localStorage.setItem(waterKey, JSON.stringify({ total: dailyTotal.value, lastDrink: lastDrinkTime.value }))
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

// Idle check timer
let idleTimer: ReturnType<typeof setInterval>
onMounted(() => {
  idleTimer = setInterval(() => { now.value = Date.now() }, 10000)
})
onUnmounted(() => clearInterval(idleTimer))

// Drink
function drink() {
  dailyTotal.value += DRINK_AMOUNT
  lastDrinkTime.value = Date.now()
  now.value = Date.now()
  save()
}

// Drag
const posKey = `water-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? props.initialX ?? 870)
const y = ref(savedPos?.y ?? props.initialY ?? 420)
watch([x, y], () => {localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })); import('../../db').then(m=>m.updateWidgetPos(props.widgetId!,x.value,y.value)).catch(()=>{})})

let dragging = false, startX = 0, startY = 0, initX = 0, initY = 0
function onDragStart(e: MouseEvent) {
  dragging = true
  startX = e.clientX; startY = e.clientY
  initX = x.value; initY = y.value
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) {
  if (!dragging) return
  x.value = initX + (e.clientX - startX)
  y.value = initY + (e.clientY - startY)
}
function onDragEnd() {
  dragging = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// Cup wave height (0-80 for SVG)
const waveHeight = computed(() => progress.value * 80)
</script>

<template>
  <div class="water-tracker" :class="status" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <div class="water-drag-bar" @mousedown="onDragStart">
      <span class="water-label">{{ statusLabel }}</span>
    </div>

    <!-- Cup -->
    <div class="water-body">
      <svg class="cup-svg" viewBox="0 0 120 140">
        <!-- Cup outline -->
        <path
          d="M25 30 L30 120 Q30 130 40 130 L80 130 Q90 130 90 120 L95 30 Z"
          fill="none"
          stroke="rgba(0,0,0,0.2)"
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
            <stop offset="0%" :stop-color="status === 'idle' ? '#ffd93d' : status === 'healthy' ? '#2DD4A8' : '#5dade2'" />
            <stop offset="100%" :stop-color="status === 'idle' ? '#f0c929' : status === 'healthy' ? '#26C498' : '#3498db'" />
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
  background: #fff;
  border-radius: 12px;
  box-shadow: 2px 2px 0 #ddd, 6px 8px 20px rgba(0,0,0,0.2);
  z-index: 57;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.2s, background 0.5s;
}
.water-tracker.idle { background: #fffef5; }
.water-tracker:hover {
  box-shadow: 2px 2px 0 #ddd, 8px 12px 24px rgba(0,0,0,0.25);
}

/* Drag bar */
.water-drag-bar {
  height: 26px;
  background: rgba(0,0,0,0.07);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.water-drag-bar:active { cursor: grabbing; background: rgba(0,0,0,0.12); }
.water-tracker.idle .water-drag-bar { background: rgba(240,200,0,0.15); }
.drag-dots { color: rgba(0,0,0,0.3); font-size: 16px; letter-spacing: 4px; user-select: none; }
.water-label { font-size: 0.8rem; font-weight: 700; color: rgba(0,0,0,0.45); }

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
  background: #5dade2;
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: 0 3px 8px rgba(93,173,226,0.4);
}
.drink-btn:hover { transform: scale(1.1); background: #3498db; }
.drink-btn:active { transform: scale(0.95); }
.water-tracker.idle .drink-btn { background: #f0c929; box-shadow: 0 3px 8px rgba(240,200,0,0.4); animation: pulse-btn 1.5s infinite; }
.water-tracker.healthy .drink-btn { background: #2DD4A8; box-shadow: 0 3px 8px rgba(45,212,168,0.4); }

@keyframes pulse-btn {
  0%, 100% { box-shadow: 0 3px 8px rgba(240,200,0,0.4); }
  50% { box-shadow: 0 3px 20px rgba(240,200,0,0.7); }
}

/* Stats */
.water-stats {
  padding: 0 12px 12px;
  text-align: center;
}
.water-amount {
  font-size: 0.75rem;
  font-weight: 700;
  color: #666;
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
  color: #e67e22;
  font-weight: 600;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
