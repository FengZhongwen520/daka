<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiDialog from '../common/UiDialog.vue'
import { usePhotoCropGeometry } from '../../composables/usePhotoCropGeometry'

interface CropView {
  x: number
  y: number
  zoom: number
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  src: string
  initial?: CropView
  aspectRatio?: number
}>(), {
  initial: () => ({ x: 50, y: 50, zoom: 1 }),
  aspectRatio: 0.86,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [value: CropView]
}>()

const stageRef = ref<HTMLElement>()
const panX = ref(50)
const panY = ref(50)
const zoom = ref(1)
const dragging = ref(false)
let startX = 0
let startY = 0
let initialX = 50
let initialY = 50
let startOverflowX = 0
let startOverflowY = 0

const stageStyle = computed(() => {
  const aspectRatio = Math.max(0.55, Math.min(1.45, props.aspectRatio))
  return {
    aspectRatio: String(aspectRatio),
    '--crop-aspect': String(aspectRatio),
  }
})

const { imageStyle, overflowX, overflowY, onImageLoad } = usePhotoCropGeometry(
  stageRef,
  () => ({ x: panX.value, y: panY.value, zoom: zoom.value }),
)

function resetDraft() {
  panX.value = Math.min(100, Math.max(0, props.initial.x))
  panY.value = Math.min(100, Math.max(0, props.initial.y))
  zoom.value = Math.min(3, Math.max(1, props.initial.zoom))
}

watch(() => props.modelValue, (open) => {
  if (open) resetDraft()
}, { immediate: true })

function close() {
  emit('update:modelValue', false)
}

function save() {
  emit('save', {
    x: panX.value,
    y: panY.value,
    zoom: zoom.value,
  })
  close()
}

function reset() {
  panX.value = 50
  panY.value = 50
  zoom.value = 1
}

function setZoom(value: number) {
  zoom.value = Math.min(3, Math.max(1, Number(value.toFixed(2))))
}

function onZoomInput(event: Event) {
  setZoom(Number((event.target as HTMLInputElement).value))
}

function beginPan(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  dragging.value = true
  startX = event.clientX
  startY = event.clientY
  initialX = panX.value
  initialY = panY.value
  startOverflowX = overflowX.value
  startOverflowY = overflowY.value
  stageRef.value?.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', onPanMove, { passive: false })
  window.addEventListener('pointerup', finishPan, { once: true })
  window.addEventListener('pointercancel', finishPan, { once: true })
}

function onPanMove(event: PointerEvent) {
  if (!dragging.value) return
  event.preventDefault()
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  panX.value = startOverflowX > 0
    ? Math.min(100, Math.max(0, initialX + (dx / startOverflowX) * 100))
    : 50
  panY.value = startOverflowY > 0
    ? Math.min(100, Math.max(0, initialY + (dy / startOverflowY) * 100))
    : 50
}

function finishPan(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  stageRef.value?.releasePointerCapture?.(event.pointerId)
  window.removeEventListener('pointermove', onPanMove)
  window.removeEventListener('pointerup', finishPan)
  window.removeEventListener('pointercancel', finishPan)
}

function onWheel(event: WheelEvent) {
  setZoom(zoom.value + (event.deltaY < 0 ? 0.1 : -0.1))
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 8 : 3
  if (event.key === 'ArrowLeft') panX.value = Math.max(0, panX.value - step)
  else if (event.key === 'ArrowRight') panX.value = Math.min(100, panX.value + step)
  else if (event.key === 'ArrowUp') panY.value = Math.max(0, panY.value - step)
  else if (event.key === 'ArrowDown') panY.value = Math.min(100, panY.value + step)
  else if (event.key === '+' || event.key === '=') setZoom(zoom.value + 0.1)
  else if (event.key === '-') setZoom(zoom.value - 0.1)
  else if (event.key === '0') reset()
  else return
  event.preventDefault()
}
</script>

<template>
  <UiDialog
    :model-value="modelValue"
    title="编辑照片显示区域"
    width="780px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="crop-editor">
      <div class="crop-stage-wrap">
        <div
          ref="stageRef"
          class="crop-stage"
          :class="{ dragging }"
          :style="stageStyle"
          tabindex="0"
          aria-label="照片取景画布，拖动照片，方向键移动，加减号缩放，0 重置"
          @pointerdown="beginPan"
          @wheel.prevent.stop="onWheel"
          @keydown="onKeydown"
        >
          <img
            :src="src"
            :style="imageStyle"
            alt="待取景照片"
            draggable="false"
            @load="onImageLoad"
          />
          <div class="crop-grid" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span class="crop-corner top-left" aria-hidden="true" />
          <span class="crop-corner top-right" aria-hidden="true" />
          <span class="crop-corner bottom-left" aria-hidden="true" />
          <span class="crop-corner bottom-right" aria-hidden="true" />
        </div>
        <p class="crop-tip">拖动照片调整显示位置，滚轮或下方滑杆缩放</p>
      </div>

      <aside class="crop-controls">
        <div class="crop-controls-head">
          <span class="crop-eyebrow">DISPLAY AREA</span>
          <h3>显示区域</h3>
          <p>方框内就是照片框最终展示的画面。</p>
        </div>

        <label class="crop-zoom">
          <span>缩放 <strong>{{ Math.round(zoom * 100) }}%</strong></span>
          <input
            :value="zoom"
            type="range"
            min="1"
            max="3"
            step="0.05"
            aria-label="照片缩放"
            @input="onZoomInput"
          />
        </label>

        <div class="crop-actions">
          <button type="button" @click="setZoom(zoom - 0.1)">− 缩小</button>
          <button type="button" @click="setZoom(zoom + 0.1)">＋ 放大</button>
          <button type="button" @click="reset">恢复居中</button>
        </div>

        <dl class="crop-readout">
          <div><dt>水平</dt><dd>{{ Math.round(panX) }}%</dd></div>
          <div><dt>垂直</dt><dd>{{ Math.round(panY) }}%</dd></div>
        </dl>
      </aside>
    </div>

    <template #footer>
      <button type="button" class="ui-button" @click="close">取消</button>
      <button type="button" class="ui-button ui-button-primary" @click="save">保存显示区域</button>
    </template>
  </UiDialog>
</template>

<style scoped>
.crop-editor {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(220px, 0.75fr);
  gap: 20px;
  align-items: start;
}
.crop-stage-wrap {
  min-width: 0;
}
.crop-stage {
  position: relative;
  width: min(100%, calc(490px * var(--crop-aspect, 0.86)));
  margin-inline: auto;
  overflow: hidden;
  border-radius: 10px;
  background: #10151d;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.1) inset,
    0 16px 40px rgba(15, 23, 42, 0.22);
  cursor: grab;
  isolation: isolate;
  touch-action: none;
}
.crop-stage.dragging { cursor: grabbing; }
.crop-stage:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 72%, transparent);
  outline-offset: 3px;
}
.crop-stage img {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  max-width: none;
  max-height: none;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
  transition: transform 120ms ease-out;
}
.crop-stage.dragging img { transition: none; }
.crop-stage::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: inherit;
  pointer-events: none;
}
.crop-grid {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
}
.crop-grid i {
  position: absolute;
  background: rgba(255, 255, 255, 0.18);
}
.crop-grid i:nth-child(1),
.crop-grid i:nth-child(2) {
  top: 0;
  bottom: 0;
  width: 1px;
}
.crop-grid i:nth-child(1) { left: 33.333%; }
.crop-grid i:nth-child(2) { left: 66.666%; }
.crop-grid i:nth-child(3),
.crop-grid i:nth-child(4) {
  right: 0;
  left: 0;
  height: 1px;
}
.crop-grid i:nth-child(3) { top: 33.333%; }
.crop-grid i:nth-child(4) { top: 66.666%; }
.crop-corner {
  position: absolute;
  z-index: 4;
  width: 18px;
  height: 18px;
  border-color: rgba(255, 255, 255, 0.85);
  border-style: solid;
  pointer-events: none;
}
.crop-corner.top-left { top: 8px; left: 8px; border-width: 2px 0 0 2px; }
.crop-corner.top-right { top: 8px; right: 8px; border-width: 2px 2px 0 0; }
.crop-corner.bottom-left { bottom: 8px; left: 8px; border-width: 0 0 2px 2px; }
.crop-corner.bottom-right { right: 8px; bottom: 8px; border-width: 0 2px 2px 0; }
.crop-tip {
  margin-top: 9px;
  color: var(--color-ink-3);
  font-size: 0.64rem;
  line-height: 1.45;
  text-align: center;
}
.crop-controls {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-surface-soft) 52%, transparent);
}
.crop-eyebrow {
  color: var(--color-primary-hover);
  font-size: 0.55rem;
  font-weight: 780;
  letter-spacing: 0.13em;
}
.crop-controls-head h3 {
  margin: 5px 0;
  color: var(--color-ink);
  font-size: 1rem;
}
.crop-controls-head p {
  color: var(--color-ink-3);
  font-size: 0.68rem;
  line-height: 1.5;
}
.crop-zoom {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.crop-zoom > span {
  display: flex;
  justify-content: space-between;
  color: var(--color-ink-2);
  font-size: 0.68rem;
}
.crop-zoom strong {
  color: var(--color-primary-hover);
  font-size: 0.63rem;
  font-variant-numeric: tabular-nums;
}
.crop-zoom input {
  width: 100%;
  accent-color: var(--color-primary);
}
.crop-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.crop-actions button {
  min-height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-ink-2);
  cursor: pointer;
  font: 620 0.64rem/1 var(--font-family);
}
.crop-actions button:last-child { grid-column: 1 / -1; }
.crop-actions button:hover {
  border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border));
  color: var(--color-primary);
}
.crop-readout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0;
}
.crop-readout div {
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-ink) 4%, transparent);
}
.crop-readout dt {
  color: var(--color-ink-3);
  font-size: 0.55rem;
}
.crop-readout dd {
  margin: 3px 0 0;
  color: var(--color-ink);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
@media (max-width: 680px) {
  .crop-editor { grid-template-columns: 1fr; }
  .crop-stage { width: min(100%, calc(390px * var(--crop-aspect, 0.86))); }
}
</style>
