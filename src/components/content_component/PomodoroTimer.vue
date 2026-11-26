<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'
import { getCloudToken } from '../../storage'
import {
  getPomodoro,
  pausePomodoro,
  resetPomodoro,
  savePomodoroSettings,
  setPomodoroNotifications,
  startPomodoro,
  type PomodoroEvent,
  type PomodoroState,
} from '../../services/cloudFeatures'
import { ensureRealtimeConnection, subscribeRealtime } from '../../services/realtime'
import { notify as toast } from '../../utils/feedback'

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const widgetId = props.widgetId ?? 0
const state = ref<PomodoroState | null>(null)
const receivedAt = ref(Date.now())
const clock = ref(Date.now())
const busy = ref(false)
const showSettings = ref(false)
const focusMin = ref(25)
const breakMin = ref(5)

const mode = computed(() => state.value?.mode ?? 'focus')
const running = computed(() => state.value?.running ?? false)
const notificationsEnabled = computed(() => state.value?.notificationsEnabled ?? true)
const remaining = computed(() => {
  const current = state.value
  if (!current) return 25 * 60
  if (!current.running) return current.remainingSeconds
  const elapsed = Math.max(0, Math.floor((clock.value - receivedAt.value) / 1000))
  return Math.max(0, current.remainingSeconds - elapsed)
})
const total = computed(() => {
  const current = state.value
  if (!current) return 25 * 60
  return (mode.value === 'focus' ? current.focusMinutes : current.breakMinutes) * 60
})
const minutes = computed(() => Math.floor(remaining.value / 60))
const seconds = computed(() => remaining.value % 60)
const progress = computed(() => total.value > 0 ? 1 - remaining.value / total.value : 0)
const circumference = 2 * Math.PI * 70
let clockTimer: ReturnType<typeof setInterval> | null = null
let fallbackPoll: ReturnType<typeof setInterval> | null = null
let unsubscribeRealtime: (() => void) | null = null

const posKey = `pomodoro-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 660, 420, true)

function tokenOrThrow(): string {
  const token = getCloudToken()
  if (!token) throw new Error('番茄钟为云端专属组件，请先登录')
  return token
}

function applyState(next: PomodoroState) {
  state.value = next
  receivedAt.value = Date.now()
  focusMin.value = next.focusMinutes
  breakMin.value = next.breakMinutes
}

async function loadState() {
  try {
    applyState(await getPomodoro(tokenOrThrow(), widgetId))
  } catch (reason) {
    toast(reason instanceof Error ? reason.message : '番茄钟状态加载失败', 'error')
  }
}

async function runAction(action: () => Promise<PomodoroState>) {
  if (busy.value) return
  busy.value = true
  try {
    applyState(await action())
  } catch (reason) {
    toast(reason instanceof Error ? reason.message : '番茄钟操作失败', 'error')
  } finally {
    busy.value = false
  }
}

function saveSettings() {
  void runAction(async () => {
    const next = await savePomodoroSettings(
      tokenOrThrow(),
      widgetId,
      Math.max(1, Math.min(120, Math.round(focusMin.value))),
      Math.max(1, Math.min(60, Math.round(breakMin.value))),
    )
    showSettings.value = false
    return next
  })
}

function openSettings() {
  if (running.value) return
  focusMin.value = state.value?.focusMinutes ?? 25
  breakMin.value = state.value?.breakMinutes ?? 5
  showSettings.value = true
}

function handleDragStart(e: MouseEvent) {
  if (showSettings.value) return
  onDragStart(e)
}

async function ensureNotifyPermission() {
  if (!notificationsEnabled.value || !('Notification' in window)) return
  if (Notification.permission === 'default') await Notification.requestPermission()
}

function notify(title: string, body: string) {
  if (!notificationsEnabled.value) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try { new Notification(title, { body }) } catch { /* ignore */ }
}

async function toggleNotify() {
  await runAction(async () => {
    const next = await setPomodoroNotifications(
      tokenOrThrow(),
      widgetId,
      !notificationsEnabled.value,
    )
    if (next.notificationsEnabled) await ensureNotifyPermission()
    return next
  })
}

function toggleTimer() {
  if (busy.value) return
  void runAction(() => (
    running.value
      ? pausePomodoro(tokenOrThrow(), widgetId)
      : startPomodoro(tokenOrThrow(), widgetId)
  ))
  if (!running.value) void ensureNotifyPermission()
}

function resetTimer() {
  void runAction(() => resetPomodoro(tokenOrThrow(), widgetId))
}

function handleRealtime(payload: unknown) {
  const update = payload as Partial<PomodoroEvent>
  if (!update.state || update.state.widgetId !== widgetId) return
  applyState(update.state)
  if (update.completed) {
    playBeep()
    if (update.state.mode === 'break') {
      notify('🍅 专注结束', `休息一下，${update.state.breakMinutes} 分钟`)
    } else {
      notify('☕ 休息结束', `开始下一轮专注，${update.state.focusMinutes} 分钟`)
    }
  }
}

onMounted(async () => {
  await loadState()
  unsubscribeRealtime = subscribeRealtime('pomodoro.state', handleRealtime)
  await ensureRealtimeConnection()
  clockTimer = setInterval(() => { clock.value = Date.now() }, 250)
  fallbackPoll = setInterval(() => { void loadState() }, 20_000)
})

onUnmounted(() => {
  unsubscribeRealtime?.()
  if (clockTimer) clearInterval(clockTimer)
  if (fallbackPoll) clearInterval(fallbackPoll)
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
  <div class="pomodoro widget-card" :class="[mode, { running }]" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="header" :on-drag-start="handleDragStart" :title="mode === 'focus' ? '🍅 专注' : '☕ 休息'" :editable="false">
      <button class="pom-gear-btn" :class="{ on: notificationsEnabled }" @click="toggleNotify" title="桌面通知" style="margin-right: 6px">🔔</button>
      <button class="pom-gear-btn" @click="openSettings" title="配置时间">⚙</button>
    </DragBar>

    <!-- Circle timer -->
    <div class="pomodoro-body">
      <svg class="progress-ring" viewBox="0 0 160 160">
        <circle class="ring-bg" cx="80" cy="80" r="70" fill="none" stroke-width="8" />
        <circle class="ring-fg" cx="80" cy="80" r="70" fill="none"
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
  border-radius: var(--radius-md);
  z-index: 57;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: background 0.6s ease, box-shadow 0.6s ease;
}
.pomodoro.focus {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-coral) 7%, transparent) 0%, transparent 42%),
    var(--widget-glass-bg);
}
.pomodoro.focus.running {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-coral) 12%, transparent) 0%, color-mix(in srgb, var(--color-coral) 5%, transparent) 30%, transparent 70%),
    var(--widget-glass-bg);
  box-shadow: 2px 2px 0 color-mix(in srgb, var(--color-coral) 15%, transparent), 6px 8px 24px color-mix(in srgb, var(--color-coral) 25%, transparent);
}
.pomodoro.break {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 7%, transparent) 0%, transparent 42%),
    var(--widget-glass-bg);
}
.pomodoro.break.running {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 14%, transparent) 0%, color-mix(in srgb, var(--color-primary) 6%, transparent) 30%, transparent 70%),
    var(--widget-glass-bg);
  box-shadow: 2px 2px 0 color-mix(in srgb, var(--color-primary) 15%, transparent), 6px 8px 24px color-mix(in srgb, var(--color-primary) 20%, transparent);
}

/* 暗色纸面 — 专注/休息 保留色调但使用深色底 */
html.dark .pomodoro.focus {
  background:
    linear-gradient(180deg, rgba(255, 118, 118, 0.1) 0%, transparent 42%),
    var(--widget-glass-bg);
}
html.dark .pomodoro.focus.running {
  background:
    linear-gradient(180deg, rgba(255, 118, 118, 0.16) 0%, rgba(255, 118, 118, 0.06) 30%, transparent 70%),
    var(--widget-glass-bg);
}
html.dark .pomodoro.break {
  background:
    linear-gradient(180deg, rgba(45, 212, 168, 0.1) 0%, transparent 42%),
    var(--widget-glass-bg);
}
html.dark .pomodoro.break.running {
  background:
    linear-gradient(180deg, rgba(45, 212, 168, 0.17) 0%, rgba(45, 212, 168, 0.07) 30%, transparent 70%),
    var(--widget-glass-bg);
}

.pom-gear-btn {
  margin-left: auto;
  width: 20px; height: 20px;
  border: none; background: rgba(0,0,0,0.06);
  border-radius: 50%; cursor: pointer;
  font-size: 11px; color: var(--color-ink-3);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.pom-gear-btn:hover { background: rgba(0,0,0,0.12); color: var(--color-ink-2); }
.pom-gear-btn.on { background: var(--color-primary-soft); }

/* Settings overlay */
.pomodoro-settings-overlay {
  position: absolute;
  inset: 26px 0 0 0;
  background: var(--color-surface);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}
.pomodoro-settings {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--color-ink-2);
  padding: 8px;
}
.pom-close-btn {
  position: absolute;
  top: 6px; right: 8px;
  width: 20px; height: 20px;
  border: none; background: rgba(0,0,0,0.06);
  border-radius: 50%; cursor: pointer;
  font-size: 10px; color: var(--color-ink-3);
  display: flex; align-items: center; justify-content: center;
}
.pom-close-btn:hover { background: rgba(0,0,0,0.12); }

.pomodoro-settings label { font-weight: 600; }
.settings-row { display: flex; align-items: center; gap: 6px; }
.settings-row input {
  width: 60px;
  padding: 4px 6px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  text-align: center;
  font-family: inherit;
  background: var(--color-surface);
  color: var(--color-ink);
}
.settings-row input:focus { border-color: var(--color-coral); outline: none; }
.settings-row span { font-size: 0.75rem; color: var(--color-ink-3); }

.pom-save {
  margin-top: 4px;
  width: 36px; height: 36px;
  background: var(--color-coral);
  color: #fff;
  border: none;
}
.pomodoro.break .pom-save { background: var(--color-primary); }

/* Dark mode */
html.dark .pom-gear-btn { background: rgba(255,255,255,0.1); }
html.dark .pom-gear-btn:hover { background: rgba(255,255,255,0.16); }
html.dark .pom-close-btn { background: rgba(255,255,255,0.1); }
html.dark .pom-close-btn:hover { background: rgba(255,255,255,0.16); }
html.dark .pomodoro-settings-overlay { background: rgba(24,26,32,0.95); }
html.dark .settings-row input { background: rgba(255,255,255,0.05); }

.pomodoro-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0 4px;
}
.progress-ring { width: 130px; height: 130px; }
.ring-bg { stroke: rgba(0,0,0,0.06); }
html.dark .ring-bg { stroke: rgba(255,255,255,0.15); }
.ring-fg {
  stroke: var(--color-coral);
  transition: stroke-dashoffset 0.3s linear, stroke 0.3s;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--color-coral) 30%, transparent));
}
.pomodoro.break .ring-fg { stroke: var(--color-primary); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--color-primary) 30%, transparent)); }
.pomodoro.running .ring-fg { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--color-coral) 50%, transparent)); }
.pomodoro.break.running .ring-fg { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--color-primary) 50%, transparent)); }

.time-display { position: absolute; display: flex; align-items: center; gap: 2px; }
.time-num {
  font-size: 2.1rem; font-weight: 800; color: var(--color-ink);
  font-variant-numeric: tabular-nums; width: 45px; text-align: center;
  font-family: var(--font-mono);
}
.time-colon { font-size: 1.8rem; font-weight: 600; color: var(--color-ink-3); }

.pomodoro-controls {
  display: flex; justify-content: center; align-items: center; gap: 12px; padding: 4px 0 14px;
}
.pom-btn {
  width: 38px; height: 38px; border-radius: 50%;
  border: 1.5px solid var(--color-border); background: var(--color-surface);
  cursor: pointer; font-size: 16px; color: var(--color-ink-2);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.pom-btn:hover { background: var(--color-surface-soft); color: var(--color-ink); transform: scale(1.05); }
.pom-btn:active { transform: scale(0.95); }

.pomodoro.focus .pom-btn { border-color: color-mix(in srgb, var(--color-coral) 20%, transparent); }
.pomodoro.focus .pom-btn:hover { background: color-mix(in srgb, var(--color-coral) 6%, var(--color-surface)); color: var(--color-coral); }
.pomodoro.focus.running .pom-btn { border-color: color-mix(in srgb, var(--color-coral) 30%, transparent); color: var(--color-coral); }

.pomodoro.break .pom-btn { border-color: color-mix(in srgb, var(--color-primary) 20%, transparent); }
.pomodoro.break .pom-btn:hover { background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface)); color: var(--color-primary); }
.pomodoro.break.running .pom-btn { border-color: color-mix(in srgb, var(--color-primary) 30%, transparent); color: var(--color-primary); }
</style>
