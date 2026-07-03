<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { getMemo, saveMemo } from '../../db'
import { MEMO_COLORS } from '../../types'

const MIN_W = 200
const MAX_W = 600
const MIN_H = 180
const MAX_H = 500

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const memoKey = `memo-${props.widgetId ?? 'default'}`

const text = ref('')
const bgColor = ref(MEMO_COLORS[0])
const x = ref(props.initialX ?? 100)
const y = ref(props.initialY ?? 100)
const w = ref(260)
const h = ref(260)
const showColors = ref(false)

// Load from DB
onMounted(async () => {
  const memo = await getMemo(memoKey)
  if (memo) {
    text.value = memo.text
    bgColor.value = memo.bgColor
    x.value = memo.x
    y.value = memo.y
    w.value = memo.width
    h.value = memo.height
  }
})

// Persist on change
const persistTimer = ref<ReturnType<typeof setTimeout>>()
function schedulePersist() {
  clearTimeout(persistTimer.value)
  persistTimer.value = setTimeout(async () => {
    await saveMemo(memoKey, {
      text: text.value,
      bgColor: bgColor.value,
      x: x.value,
      y: y.value,
      width: w.value,
      height: h.value,
    })
  }, 500)
}

watch([text, bgColor, x, y, w, h], schedulePersist, { deep: false })

// Drag
let dragging = false
let dragStartX = 0
let dragStartY = 0
let initX = 0
let initY = 0

function onDragStart(e: MouseEvent) {
  dragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  initX = x.value
  initY = y.value
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragging) return
  x.value = initX + (e.clientX - dragStartX)
  y.value = initY + (e.clientY - dragStartY)
}

function onDragEnd() {
  dragging = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// Resize
let resizing = false
let resizeStartX = 0
let resizeStartY = 0
let initW = 0
let initH = 0

function onResizeStart(e: MouseEvent) {
  e.stopPropagation()
  resizing = true
  resizeStartX = e.clientX
  resizeStartY = e.clientY
  initW = w.value
  initH = h.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizing) return
  w.value = Math.min(MAX_W, Math.max(MIN_W, initW + (e.clientX - resizeStartX)))
  h.value = Math.min(MAX_H, Math.max(MIN_H, initH + (e.clientY - resizeStartY)))
}

function onResizeEnd() {
  resizing = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

// Limit lines
const MAX_LINES = 100

function enforceLineLimit() {
  const lines = text.value.split('\n')
  if (lines.length > MAX_LINES) {
    text.value = lines.slice(0, MAX_LINES).join('\n')
  }
}
</script>

<template>
  <div
    class="memo-container"
    :style="{
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px',
      background: bgColor,
    }"
  >
    <!-- Header -->
    <div class="memo-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
      <span class="memo-title">📝 便签</span>
      <div class="memo-colors">
        <button
          class="memo-color-toggle"
          @click="showColors = !showColors"
          @mousedown.stop
          title="切换颜色"
        >🎨</button>
        <div v-if="showColors" class="memo-color-palette" @mousedown.stop>
          <button
            v-for="c in MEMO_COLORS"
            :key="c"
            class="memo-color-dot"
            :class="{ active: bgColor === c }"
            :style="{ background: c }"
            @click="bgColor = c; showColors = false"
          ></button>
        </div>
      </div>
    </div>

    <!-- Text -->
    <textarea
      v-model="text"
      class="memo-textarea"
      placeholder="写点什么..."
      @input="enforceLineLimit"
      @mousedown.stop
    ></textarea>

    <!-- Line count -->
    <div class="memo-footer">
      {{ text.split('\n').length }} / {{ MAX_LINES }} 行
    </div>

    <!-- Resize handle -->
    <div class="memo-resize" @mousedown="onResizeStart"></div>
  </div>
</template>

<style scoped>
.memo-container {
  position: absolute;
  border-radius: 4px;
  box-shadow:
    3px 3px 0 rgba(0,0,0,0.1),
    8px 10px 24px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  z-index: 60;
  overflow: hidden;
  min-width: v-bind('MIN_W + "px"');
  min-height: v-bind('MIN_H + "px"');
  transition: box-shadow 0.2s;
}
.memo-container:hover {
  box-shadow:
    3px 3px 0 rgba(0,0,0,0.12),
    10px 14px 30px rgba(0,0,0,0.25);
}

.memo-drag-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 10px;
  background: rgba(0,0,0,0.07);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.memo-drag-bar:active { cursor: grabbing; background: rgba(0,0,0,0.12); }

.drag-dots {
  color: rgba(0,0,0,0.3);
  font-size: 16px;
  letter-spacing: 4px;
  user-select: none;
}

.memo-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(0,0,0,0.45);
}

.memo-colors {
  position: relative;
  margin-left: auto;
}
.memo-color-toggle {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(0,0,0,0.06);
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.memo-color-toggle:hover { background: rgba(0,0,0,0.12); }

.memo-color-palette {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  display: flex;
  gap: 4px;
  padding: 6px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 10;
}
.memo-color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.memo-color-dot:hover { transform: scale(1.2); }
.memo-color-dot.active { border-color: #333; }

.memo-textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  padding: 8px 12px;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 0.85rem;
  line-height: 1.6;
  color: #444;
  background: transparent;
  min-height: 0;
}
.memo-textarea::placeholder { color: rgba(0,0,0,0.2); }

.memo-footer {
  padding: 2px 10px;
  font-size: 0.65rem;
  color: rgba(0,0,0,0.3);
  text-align: right;
  flex-shrink: 0;
  user-select: none;
}

.memo-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background:
    linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.15) 55%, transparent 55%),
    linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 55%, transparent 55%);
  background-position: 100% 100%, calc(100% - 5px) 100%;
  background-size: 8px 8px, 8px 8px;
  background-repeat: no-repeat;
}
</style>
