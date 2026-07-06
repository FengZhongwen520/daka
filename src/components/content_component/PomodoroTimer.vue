<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()

// Settings — with widgetId isolation
const settingsKey = `pomodoro-settings${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedSettings = JSON.parse(localStorage.getItem(settingsKey) || 'null')
const focusMin = ref(savedSettings?.focus ?? 25)
const breakMin = ref(savedSettings?.break ?? 5)
const showSettings = ref(false)

const focusSec = computed(() => focusMin.value * 60)
const breakSec = computed(() => breakMin.value * 60)

const mode = ref<'focus' | 'break'>('focus')
const remaining = ref(focusSec.value)
const running = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const total = computed(() => mode.value === 'focus' ? focusSec.value : breakSec.value)
const minutes = computed(() => Math.floor(remaining.value / 60))
const seconds = computed(() => remaining.value % 60)
const progress = computed(() => total.value > 0 ? 1 - remaining.value / total.value : 0)
const circumference = 2 * Math.PI * 70

function saveSettings() {
  localStorage.setItem(settingsKey, JSON.stringify({ focus: focusMin.value, break: breakMin.value }))
  if (mode.value === 'focus') remaining.value = focusSec.value
  else remaining.value = breakSec.value
  showSettings.value = false
}

function openSettings() {
  if (running.value) return
  showSettings.value = true
}

const posKey = `pomodoro-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 660, 420, true)

function handleDragStart(e: MouseEvent) {
  if (showSettings.value) return
  onDragStart(e)
}

function tick() {
  if (remaining.value <= 0) return
  remaining.value--
  if (remaining.value <= 0) {
    clearInterval(timer!)
    timer = null
    running.value = false
    playBeep()
    if (mode.value === 'focus') {
      mode.value = 'break'
      remaining.value = breakSec.value
    } else {
      mode.value = 'focus'
      remaining.value = focusSec.value
    }
  }
}

function toggleTimer() {
  if (running.value) {
    clearInterval(timer!)
    timer = null
    running.value = false
  } else {
    running.value = true
    timer = setInterval(tick, 1000)
  }
}

function resetTimer() {
  clearInterval(timer!)
  timer = null
  running.value = false
  mode.value = 'focus'
  remaining.value = focusSec.value
}

onUnmounted(() => {
  clearInterval(timer!)
})

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 800; gain.gain.value = 0.3
    osc.start(); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => {
      const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain()
      osc2.connect(gain2); gain2.connect(ctx.destination)
      osc2.frequency.value = 1000; gain2.gain.value = 0.3
      osc2.start(); gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc2.stop(ctx.currentTime + 0.5)
    }, 300)
  } catch (_) {}
}
</script>

<template>
  <div class="pomodoro" :class="[mode, { running }]" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="header" :on-drag-start="handleDragStart" :title="mode === 'focus' ? '🍅 专注' : '☕ 休息'" :editable="false">
      <button class="pom-gear-btn" @click="openSettings" title="配置时间">⚙</button>
    </DragBar>

    <!-- Circle timer -->
    <div class="pomodoro-body">
      <svg class="progress-ring" viewBox="0 0 160 160">
        <circle class="ring-bg" cx="80" cy="80" r="70" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="8" />
        <circle class="ring-fg" cx="80" cy="80" r="70" fill="none"
          :stroke="mode === 'focus' ? '#ff6b6b' : '#2DD4A8'"
          stroke-width="8" stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="circumference * (1 - progress)"
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div class="time-display">
        <span class="time-num">{{ String(minutes).padStart(2, '0') }}</span>
        <span class="time-colon">:</span>
        <span class="time-num">{{ String(seconds).padStart(2, '0') }}</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="pomodoro-controls">
      <button class="pom-btn" @click="resetTimer" title="重置">↺</button>
      <button class="pom-btn" @click="toggleTimer" :title="running ? '暂停' : '开始'">
        {{ running ? '⏸' : '▶' }}
      </button>
    </div>

    <!-- Settings overlay -->
    <div v-if="showSettings" class="pomodoro-settings-overlay" @mousedown.stop>
      <div class="pomodoro-settings">
        <button class="pom-close-btn" @click="showSettings = false">✕</button>
        <label>专注</label>
        <div class="settings-row"><input v-model.number="focusMin" type="number" min="1" max="120" /><span>分钟</span></div>
        <label>休息</label>
        <div class="settings-row"><input v-model.number="breakMin" type="number" min="1" max="60" /><span>分钟</span></div>
        <button class="pom-btn pom-save" @click="saveSettings">✓</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pomodoro {
  position: absolute;
  width: 180px;
  border-radius: 12px;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.08), 6px 8px 20px rgba(0,0,0,0.15);
  z-index: 57;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: background 0.6s ease, box-shadow 0.6s ease;
}
.pomodoro.focus { background: linear-gradient(180deg, #fff5f5 0%, #fff 40%); }
.pomodoro.focus.running {
  background: linear-gradient(180deg, #ffe8e8 0%, #fff0f0 30%, #fff 70%);
  box-shadow: 2px 2px 0 rgba(255,100,100,0.15), 6px 8px 24px rgba(255,107,107,0.25);
}
.pomodoro.break { background: linear-gradient(180deg, #f0fdf8 0%, #fff 40%); }
.pomodoro.break.running {
  background: linear-gradient(180deg, #e0faf0 0%, #edfdf6 30%, #fff 70%);
  box-shadow: 2px 2px 0 rgba(45,212,168,0.15), 6px 8px 24px rgba(45,212,168,0.2);
}

.pom-gear-btn {
  margin-left: auto;
  width: 20px; height: 20px;
  border: none; background: rgba(0,0,0,0.06);
  border-radius: 50%; cursor: pointer;
  font-size: 11px; color: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.pom-gear-btn:hover { background: rgba(0,0,0,0.12); color: rgba(0,0,0,0.6); }

/* Settings overlay */
.pomodoro-settings-overlay {
  position: absolute;
  inset: 26px 0 0 0;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  border-radius: 0 0 12px 12px;
}
.pomodoro-settings {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: #555;
  padding: 8px;
}
.pom-close-btn {
  position: absolute;
  top: 6px; right: 8px;
  width: 20px; height: 20px;
  border: none; background: rgba(0,0,0,0.06);
  border-radius: 50%; cursor: pointer;
  font-size: 10px; color: #999;
  display: flex; align-items: center; justify-content: center;
}
.pom-close-btn:hover { background: rgba(0,0,0,0.12); }

.pomodoro-settings label { font-weight: 600; }
.settings-row { display: flex; align-items: center; gap: 6px; }
.settings-row input {
  width: 60px;
  padding: 4px 6px;
  border: 1.5px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.9rem;
  text-align: center;
  font-family: inherit;
}
.settings-row input:focus { border-color: #ff6b6b; outline: none; }
.settings-row span { font-size: 0.75rem; color: #999; }

.pom-save {
  margin-top: 4px;
  width: 36px; height: 36px;
  background: #ff6b6b !important;
  color: #fff !important;
  border: none !important;
}
.pomodoro.break .pom-save { background: #2DD4A8 !important; }

.pomodoro-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0 4px;
}
.progress-ring { width: 130px; height: 130px; }
.ring-fg {
  transition: stroke-dashoffset 0.3s linear, stroke 0.3s;
  filter: drop-shadow(0 0 4px rgba(255,107,107,0.3));
}
.pomodoro.break .ring-fg { filter: drop-shadow(0 0 4px rgba(45,212,168,0.3)); }
.pomodoro.running .ring-fg { filter: drop-shadow(0 0 8px rgba(255,107,107,0.5)); }
.pomodoro.break.running .ring-fg { filter: drop-shadow(0 0 8px rgba(45,212,168,0.5)); }

.time-display { position: absolute; display: flex; align-items: center; gap: 2px; }
.time-num {
  font-size: 2.1rem; font-weight: 800; color: #2d3436;
  font-variant-numeric: tabular-nums; width: 45px; text-align: center;
}
.time-colon { font-size: 1.8rem; font-weight: 600; color: #999; }

.pomodoro-controls {
  display: flex; justify-content: center; align-items: center; gap: 12px; padding: 4px 0 14px;
}
.pom-btn {
  width: 38px; height: 38px; border-radius: 50%;
  border: 1.5px solid #e0e0e0; background: #fff;
  cursor: pointer; font-size: 16px; color: #888;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.pom-btn:hover { background: #f5f5f5; color: #555; transform: scale(1.05); }
.pom-btn:active { transform: scale(0.95); }

.pomodoro.focus .pom-btn { border-color: rgba(255,107,107,0.2); }
.pomodoro.focus .pom-btn:hover { background: #fff0f0; color: #ff6b6b; }
.pomodoro.focus.running .pom-btn { border-color: rgba(255,107,107,0.3); color: #ff6b6b; }

.pomodoro.break .pom-btn { border-color: rgba(45,212,168,0.2); }
.pomodoro.break .pom-btn:hover { background: #f0fdf8; color: #2DD4A8; }
.pomodoro.break.running .pom-btn { border-color: rgba(45,212,168,0.3); color: #2DD4A8; }
</style>
