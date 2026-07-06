<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()

// Load saved text
const textKey = `sticky-text${props.widgetId != null ? '-' + props.widgetId : ''}`
const text = ref(localStorage.getItem(textKey) || '')
watch(text, (v) => localStorage.setItem(textKey, v))

// Position
const posKey = `sticky-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const saved = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(saved?.x ?? props.initialX ?? 80)
const y = ref(saved?.y ?? props.initialY ?? 12)
watch([x, y], () => {localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })); import('../../db').then(m=>m.updateWidgetPos(props.widgetId!,x.value,y.value)).catch(()=>{})})

let dragging = false, sx = 0, sy = 0, ix = 0, iy = 0
function onDragStart(e: MouseEvent) {
  dragging = true; sx = e.clientX; sy = e.clientY; ix = x.value; iy = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) { if (!dragging) return; x.value = ix + (e.clientX - sx); y.value = iy + (e.clientY - sy) }
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }
</script>

<template>
  <div class="sticky-note" :style="{ left: x + 'px', top: y + 'px' }">
    <div class="sticky-drag-bar" @mousedown="onDragStart"><span class="drag-dots">⋮⋮</span></div>
    <textarea
      v-model="text"
      class="sticky-textarea"
      placeholder="写点什么..."
      @mousedown.stop
    ></textarea>
  </div>
</template>

<style scoped>
.sticky-note {
  position: absolute; width: 180px; min-height: 80px; padding: 26px 12px 14px;
  background: #fff385; transform: rotate(-3deg);
  box-shadow: 8px 8px 16px rgba(0,0,0,0.2); z-index: 56;
  border-bottom-right-radius: 60px 5px;
}
.sticky-drag-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 22px;
  background: rgba(0,0,0,0.08); display: flex; align-items: center; justify-content: center;
  cursor: grab; opacity: 0; transition: opacity 0.2s; border-radius: 3px 3px 0 0;
}
.sticky-note:hover .sticky-drag-bar { opacity: 1; }
.sticky-drag-bar:active { cursor: grabbing; background: rgba(0,0,0,0.14); }
.drag-dots { color: rgba(0,0,0,0.35); font-size: 16px; letter-spacing: 4px; user-select: none; }
.sticky-textarea {
  width: 100%; min-height: 60px; border: none; outline: none; resize: vertical;
  background: transparent; font-size: 0.78rem; color: #555; line-height: 1.5;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.sticky-textarea::placeholder { color: rgba(0,0,0,0.2); }
</style>
