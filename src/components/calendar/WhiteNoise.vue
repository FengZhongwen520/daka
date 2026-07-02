<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

// Sound definitions
const sounds = [
  { id: 'rain', icon: '🌧', label: '雨声' },
  { id: 'cafe', icon: '☕', label: '咖啡馆' },
  { id: 'forest', icon: '🌲', label: '森林' },
  { id: 'fire', icon: '🔥', label: '壁炉' },
  { id: 'ocean', icon: '🌊', label: '海浪' },
  { id: 'meditate', icon: '🎵', label: '冥想' },
]

const active = ref<Record<string, boolean>>({})
const volume = ref(0.5)
const isPlaying = ref(false)

// Audio engine
let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
const soundNodes = new Map<string, { gain: GainNode; stop: () => void }>()

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = volume.value
    masterGain.connect(audioCtx.destination)
  }
  return audioCtx
}

function startSound(id: string) {
  const ctx = getCtx()
  if (soundNodes.has(id)) return

  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(masterGain!)

  let stopFn: () => void

  switch (id) {
    case 'rain':
      stopFn = createRain(ctx, gain)
      break
    case 'cafe':
      stopFn = createCafe(ctx, gain)
      break
    case 'forest':
      stopFn = createForest(ctx, gain)
      break
    case 'fire':
      stopFn = createFire(ctx, gain)
      break
    case 'ocean':
      stopFn = createOcean(ctx, gain)
      break
    case 'meditate':
      stopFn = createMeditate(ctx, gain)
      break
    default:
      stopFn = () => {}
  }

  soundNodes.set(id, { gain, stop: stopFn })
  // Fade in
  gain.gain.setTargetAtTime(1, ctx.currentTime, 0.3)
}

function stopSound(id: string) {
  const node = soundNodes.get(id)
  if (!node) return
  const ctx = getCtx()
  node.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
  setTimeout(() => {
    node.stop()
    soundNodes.delete(id)
  }, 500)
}

// Sound generators (Web Audio API)
function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const bufferSize = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function createRain(ctx: AudioContext, out: GainNode): () => void {
  const src = noiseSource(ctx)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 800
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 100
  src.connect(lp)
  lp.connect(hp)
  hp.connect(out)
  src.start()
  return () => { try { src.stop() } catch (_) {} }
}

function createCafe(ctx: AudioContext, out: GainNode): () => void {
  const src1 = noiseSource(ctx)
  const lp1 = ctx.createBiquadFilter()
  lp1.type = 'lowpass'
  lp1.frequency.value = 1500
  const gain1 = ctx.createGain()
  gain1.gain.value = 0.4

  const src2 = noiseSource(ctx)
  const lp2 = ctx.createBiquadFilter()
  lp2.type = 'bandpass'
  lp2.frequency.value = 400
  const gain2 = ctx.createGain()
  gain2.gain.value = 0.6

  src1.connect(lp1).connect(gain1).connect(out)
  src2.connect(lp2).connect(gain2).connect(out)
  src1.start()
  src2.start()

  // Occasional "clink"
  const clinkInterval = setInterval(() => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 1200 + Math.random() * 800
    g.gain.value = 0.15
    g.gain.setTargetAtTime(0, ctx.currentTime + 0.05, 0.02)
    osc.connect(g).connect(out)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  }, 3000 + Math.random() * 4000)

  return () => {
    try { src1.stop(); src2.stop() } catch (_) {}
    clearInterval(clinkInterval)
  }
}

function createForest(ctx: AudioContext, out: GainNode): () => void {
  // Wind
  const wind = noiseSource(ctx)
  const windLP = ctx.createBiquadFilter()
  windLP.type = 'lowpass'
  windLP.frequency.value = 400
  wind.connect(windLP)
  windLP.connect(out)
  wind.start()

  // Bird chirps
  const birdInterval = setInterval(() => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    const baseFreq = 1500 + Math.random() * 2500
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime)
    osc.frequency.setValueAtTime(baseFreq * 1.3, ctx.currentTime + 0.08)
    osc.frequency.setValueAtTime(baseFreq * 0.8, ctx.currentTime + 0.16)
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.setTargetAtTime(0.12, ctx.currentTime + 0.02, 0.03)
    g.gain.setTargetAtTime(0, ctx.currentTime + 0.15, 0.05)
    osc.connect(g).connect(out)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  }, 1000 + Math.random() * 3000)

  return () => {
    try { wind.stop() } catch (_) {}
    clearInterval(birdInterval)
  }
}

function createFire(ctx: AudioContext, out: GainNode): () => void {
  const src = noiseSource(ctx)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 600
  bp.Q.value = 2
  src.connect(bp).connect(out)
  src.start()

  // Crackles
  const crackleInterval = setInterval(() => {
    const burst = noiseSource(ctx)
    const g = ctx.createGain()
    const bp2 = ctx.createBiquadFilter()
    bp2.type = 'bandpass'
    bp2.frequency.value = 1200
    bp2.Q.value = 4
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.setTargetAtTime(0.5, ctx.currentTime + 0.01, 0.02)
    g.gain.setTargetAtTime(0, ctx.currentTime + 0.08, 0.05)
    burst.connect(bp2).connect(g).connect(out)
    burst.start()
    burst.stop(ctx.currentTime + 0.15)
  }, 200 + Math.random() * 500)

  return () => {
    try { src.stop() } catch (_) {}
    clearInterval(crackleInterval)
  }
}

function createOcean(ctx: AudioContext, out: GainNode): () => void {
  const src = noiseSource(ctx)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 500

  // Slow amplitude modulation for wave effect
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.1
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.4
  const modGain = ctx.createGain()
  lfo.connect(lfoGain)
  lfoGain.connect(modGain.gain)
  modGain.gain.value = 0.6

  src.connect(lp).connect(modGain).connect(out)
  src.start()
  lfo.start()

  return () => {
    try { src.stop(); lfo.stop() } catch (_) {}
  }
}

function createMeditate(ctx: AudioContext, out: GainNode): () => void {
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  osc1.type = 'sine'
  osc2.type = 'sine'
  osc1.frequency.value = 220 // A3
  osc2.frequency.value = 330 // E4 (perfect fifth)

  const g1 = ctx.createGain()
  const g2 = ctx.createGain()
  g1.gain.value = 0.15
  g2.gain.value = 0.1

  // Slow modulation
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.05
  const lfoG = ctx.createGain()
  lfoG.gain.value = 5
  lfo.connect(lfoG).connect(osc1.frequency)

  osc1.connect(g1).connect(out)
  osc2.connect(g2).connect(out)
  osc1.start()
  osc2.start()
  lfo.start()

  return () => {
    try { osc1.stop(); osc2.stop(); lfo.stop() } catch (_) {}
  }
}

function toggleSound(id: string) {
  if (active.value[id]) {
    active.value[id] = false
    stopSound(id)
  } else {
    active.value[id] = true
    if (!isPlaying.value) {
      isPlaying.value = true
    }
    startSound(id)
  }
  // Check if any sounds still active
  if (!Object.values(active.value).some(v => v)) {
    isPlaying.value = false
  }
}

function stopAll() {
  for (const id of Object.keys(active.value)) {
    if (active.value[id]) {
      active.value[id] = false
      stopSound(id)
    }
  }
  isPlaying.value = false
}

watch(volume, (v) => {
  if (masterGain) {
    masterGain.gain.setTargetAtTime(v, getCtx().currentTime, 0.1)
  }
})

onUnmounted(() => {
  stopAll()
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
})

// Drag
const props = defineProps<{ widgetId?: number }>()
const posKey = `whitenoise-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? 20)
const y = ref(savedPos?.y ?? 300)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))

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
</script>

<template>
  <div class="whitenoise" :class="{ playing: isPlaying }" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <div class="wn-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
      <span class="wn-label">📻 白噪音</span>
      <span v-if="isPlaying" class="wn-playing-dot"></span>
    </div>

    <!-- Body -->
    <div class="wn-body">
      <!-- Speaker grille decoration -->
      <div class="wn-grille">
        <div class="grille-line" v-for="i in 4" :key="i"></div>
      </div>

      <!-- Sound buttons -->
      <div class="wn-sounds">
        <button
          v-for="s in sounds"
          :key="s.id"
          class="wn-sound-btn"
          :class="{ active: active[s.id] }"
          @click="toggleSound(s.id)"
        >
          <span class="sound-icon">{{ s.icon }}</span>
          <span class="sound-label">{{ s.label }}</span>
        </button>
      </div>

      <!-- Volume knob -->
      <div class="wn-volume">
        <span class="vol-icon">🔉</span>
        <input
          v-model.number="volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          class="vol-slider"
        />
        <span class="vol-icon">🔊</span>
      </div>

      <!-- Stop all -->
      <button v-if="isPlaying" class="wn-stop-btn" @click="stopAll">■ 停止全部</button>
    </div>
  </div>
</template>

<style scoped>
.whitenoise {
  position: absolute;
  width: 280px;
  background: #3d2b1f;
  background-image:
    linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(0,0,0,0.1) 100%),
    repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(0,0,0,0.05) 8px, rgba(0,0,0,0.05) 9px);
  border-radius: 12px;
  box-shadow:
    4px 4px 0 #2a1a0e,
    8px 10px 24px rgba(0,0,0,0.35);
  z-index: 57;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 2px solid #5a3d2b;
}

/* Drag bar */
.wn-drag-bar {
  height: 28px;
  background: rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.wn-drag-bar:active { cursor: grabbing; }
.drag-dots { color: rgba(255,255,255,0.3); font-size: 16px; letter-spacing: 4px; user-select: none; }
.wn-label { font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.7); }

.wn-playing-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #4f8;
  margin-left: auto;
  animation: blink-dot 1s infinite;
  box-shadow: 0 0 6px #4f8;
}
@keyframes blink-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Body */
.wn-body {
  padding: 10px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Speaker grille */
.wn-grille {
  display: flex;
  gap: 4px;
  padding: 2px 0;
}
.grille-line {
  flex: 1;
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
}

/* Sound buttons */
.wn-sounds {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.wn-sound-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px 8px;
  border-radius: 8px;
  border: 1.5px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  cursor: pointer;
  transition: all 0.2s;
  color: rgba(255,255,255,0.5);
}
.wn-sound-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }
.wn-sound-btn.active {
  background: rgba(255,180,60,0.15);
  border-color: rgba(255,180,60,0.5);
  color: #ffb83c;
  box-shadow: 0 0 12px rgba(255,180,60,0.2);
}

.sound-icon { font-size: 22px; }
.sound-label { font-size: 0.7rem; font-weight: 600; }

/* Volume */
.wn-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.vol-icon { font-size: 14px; opacity: 0.5; }
.vol-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.15);
  outline: none;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #c8a87c;
  border: 2px solid #8b6914;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

/* Stop button */
.wn-stop-btn {
  width: 100%;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,80,80,0.15);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  transition: all 0.2s;
  font-family: inherit;
}
.wn-stop-btn:hover { background: rgba(255,80,80,0.25); }
</style>
