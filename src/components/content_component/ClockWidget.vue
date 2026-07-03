<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

type ClockMode = 'digital' | 'analog'

const savedMode = localStorage.getItem('clock-mode') as ClockMode | null
const mode = ref<ClockMode>(savedMode === 'digital' || savedMode === 'analog' ? savedMode : 'digital')
watch(mode, (v) => localStorage.setItem('clock-mode', v))

const now = ref(new Date())

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => now.value = new Date(), 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const hours = computed(() => now.value.getHours())
const minutes = computed(() => now.value.getMinutes())
const seconds = computed(() => now.value.getSeconds())

const timeStr = computed(() => {
  const h = String(hours.value).padStart(2, '0')
  const m = String(minutes.value).padStart(2, '0')
  const s = String(seconds.value).padStart(2, '0')
  return `${h}:${m}:${s}`
})

const dateStr = computed(() => {
  const y = now.value.getFullYear()
  const m = String(now.value.getMonth() + 1).padStart(2, '0')
  const d = String(now.value.getDate()).padStart(2, '0')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const w = weekdays[now.value.getDay()]
  return `${y}年${m}月${d}日 星期${w}`
})

// Analog clock angles
const hourAngle = computed(() => (hours.value % 12) * 30 + minutes.value * 0.5)
const minuteAngle = computed(() => minutes.value * 6 + seconds.value * 0.1)
const secondAngle = computed(() => seconds.value * 6)

// Tick marks for analog clock
const hourTicks = Array.from({ length: 12 }, (_, i) => i)

function toggleMode() {
  mode.value = mode.value === 'digital' ? 'analog' : 'digital'
}

// Title
const savedTitle = JSON.parse(localStorage.getItem('clock-title') || 'null')
const title = ref(savedTitle ?? '🕐 时钟')
watch(title, (v) => localStorage.setItem('clock-title', JSON.stringify(v)))

const editingTitle = ref(false)
const titleInput = ref<HTMLInputElement>()
function startEditTitle() { editingTitle.value = true; setTimeout(() => titleInput.value?.focus(), 50) }
function saveTitle() { editingTitle.value = false; if (!title.value.trim()) title.value = '🕐 时钟' }

// Drag
const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const posKey = `clock-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? props.initialX ?? 700)
const y = ref(savedPos?.y ?? props.initialY ?? 80)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))

let dragging = false, sx = 0, sy = 0, ix = 0, iy = 0
function onDragStart(e: MouseEvent) {
  dragging = true; sx = e.clientX; sy = e.clientY; ix = x.value; iy = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) { if (!dragging) return; x.value = ix + (e.clientX - sx); y.value = iy + (e.clientY - sy) }
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }
</script>

<template>
  <div class="clock-widget" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <div class="cl-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
      <input
        v-if="editingTitle"
        ref="titleInput"
        v-model="title"
        class="cl-title-input"
        @blur="saveTitle"
        @keyup.enter="saveTitle"
        @mousedown.stop
      />
      <span v-else class="cl-label" @dblclick="startEditTitle">{{ title }}</span>
      <button class="cl-mode-btn" @mousedown.stop @click="toggleMode" :title="mode === 'digital' ? '切换钟表' : '切换数字'">
        {{ mode === 'digital' ? '⌚' : '🔢' }}
      </button>
    </div>

    <!-- Body -->
    <div class="cl-body">
      <!-- Digital Clock -->
      <div v-if="mode === 'digital'" class="cl-digital">
        <div class="cl-time">
          <span class="cl-time-seg">{{ timeStr.slice(0, 2) }}</span>
          <span class="cl-time-colon">:</span>
          <span class="cl-time-seg">{{ timeStr.slice(3, 5) }}</span>
          <span class="cl-time-colon">{{ seconds % 2 === 0 ? ':' : ' ' }}</span>
          <span class="cl-time-seg">{{ timeStr.slice(6, 8) }}</span>
        </div>
        <div class="cl-date">{{ dateStr }}</div>
        <div class="cl-period">{{ hours >= 12 ? 'PM' : 'AM' }}</div>
      </div>

      <!-- Analog Clock -->
      <div v-else class="cl-analog">
        <div class="cl-face">
          <!-- Hour ticks -->
          <div
            v-for="i in hourTicks"
            :key="i"
            class="cl-tick"
            :style="{ transform: `rotate(${i * 30}deg) translateY(-63px)` }"
          >
            <span class="cl-tick-dot" :class="{ major: i % 3 === 0 }">{{ i === 0 ? '' : '' }}</span>
          </div>
          <!-- Hour markers -->
          <div class="cl-numerals">
            <span v-for="i in 12" :key="'n'+i" class="cl-num" :style="{
              transform: `rotate(${i * 30}deg) translateY(-48px) rotate(-${i * 30}deg)`
            }">{{ i }}</span>
          </div>
          <!-- Hands -->
          <div class="cl-hand hour" :style="{ transform: `rotate(${hourAngle}deg)` }"></div>
          <div class="cl-hand minute" :style="{ transform: `rotate(${minuteAngle}deg)` }"></div>
          <div class="cl-hand second" :style="{ transform: `rotate(${secondAngle}deg)` }"></div>
          <div class="cl-center"></div>
        </div>
        <div class="cl-analog-date">{{ dateStr }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clock-widget {
  position: absolute;
  width: 210px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(1.5);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  z-index: 56;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.3s;
}
.clock-widget:hover {
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.14);
}

/* Drag bar */
.cl-drag-bar {
  height: 24px;
  background: rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.cl-drag-bar:active { cursor: grabbing; }
.drag-dots { color: rgba(0, 0, 0, 0.2); font-size: 12px; letter-spacing: 2px; }
.cl-label { font-size: 0.72rem; font-weight: 700; color: rgba(0, 0, 0, 0.45); cursor: pointer; }
.cl-label:hover { color: rgba(0, 0, 0, 0.65); }
.cl-title-input {
  width: 70px; font-size: 0.72rem; font-weight: 700;
  border: 1.5px solid #2DD4A8; border-radius: 4px;
  padding: 1px 4px; outline: none; font-family: inherit;
  background: rgba(255, 255, 255, 0.9);
}
.cl-mode-btn {
  margin-left: auto;
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.04);
  cursor: pointer;
  font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
  padding: 0;
  line-height: 1;
}
.cl-mode-btn:hover {
  background: rgba(45, 212, 168, 0.12);
  border-color: #2DD4A8;
}

/* Body — fixed height prevents layout shift between modes */
.cl-body {
  height: 200px;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

/* === Digital === */
.cl-digital {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
}
.cl-time {
  display: flex;
  align-items: center;
  gap: 3px;
}
.cl-time-seg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 54px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 10px;
  font-size: 1.7rem;
  font-weight: 800;
  color: #2d3436;
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  letter-spacing: 1px;
}
.cl-time-colon {
  font-size: 1.4rem;
  font-weight: 700;
  color: #2DD4A8;
  width: 12px;
  text-align: center;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
}
.cl-date {
  font-size: 0.68rem;
  font-weight: 600;
  color: #999;
  letter-spacing: 0.3px;
}
.cl-period {
  font-size: 0.62rem;
  font-weight: 700;
  color: #2DD4A8;
  background: rgba(45, 212, 168, 0.1);
  padding: 1px 10px;
  border-radius: 8px;
}

/* === Analog === */
.cl-analog {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
}
.cl-face {
  position: relative;
  width: 145px;
  height: 145px;
  border-radius: 50%;
  background: radial-gradient(circle at center, #fdfdfd 0%, #f5f5f5 100%);
  border: 2.5px solid #e8e8e8;
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.06),
    0 3px 12px rgba(0, 0, 0, 0.08),
    0 0 0 5px rgba(0, 0, 0, 0.02);
}

/* Ticks */
.cl-tick {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
}
.cl-tick-dot {
  display: block;
  width: 1.5px;
  height: 5px;
  background: #ccc;
  border-radius: 1px;
  margin-left: -0.75px;
  margin-top: -2.5px;
}
.cl-tick-dot.major {
  width: 2px;
  height: 8px;
  background: #aaa;
  margin-left: -1px;
  margin-top: -4px;
}

/* Numerals */
.cl-numerals {
  position: absolute;
  inset: 14px;
}
.cl-num {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 18px;
  margin-left: -9px;
  margin-top: -9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: #666;
}

/* Hands */
.cl-hand {
  position: absolute;
  bottom: 50%;
  left: 50%;
  transform-origin: bottom center;
  border-radius: 2px;
  z-index: 2;
}
.cl-hand.hour {
  width: 3.5px;
  height: 33px;
  margin-left: -1.75px;
  background: #444;
  border-radius: 3px;
}
.cl-hand.minute {
  width: 2.5px;
  height: 49px;
  margin-left: -1.25px;
  background: #666;
  border-radius: 2px;
}
.cl-hand.second {
  width: 1.5px;
  height: 58px;
  margin-left: -0.75px;
  background: #2DD4A8;
  border-radius: 1px;
  z-index: 3;
  transition: transform 0.05s linear;
}

.cl-center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  margin-top: -4px;
  background: #2DD4A8;
  border-radius: 50%;
  z-index: 4;
  box-shadow: 0 0 0 3px rgba(45, 212, 168, 0.2);
}

.cl-analog-date {
  font-size: 0.7rem;
  font-weight: 600;
  color: #999;
}
</style>
