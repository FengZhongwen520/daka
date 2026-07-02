<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { selectedProjectId, currentYear, currentMonth } from '../../store'
import { getProjects, getCheckIns } from '../../db'
import { getDaysInMonth } from '../../utils/date'

const projectName = ref('')
const projectIcon = ref('')
const checkedCount = ref(0)
const totalDays = computed(() => getDaysInMonth(currentYear.value, currentMonth.value))

watch([selectedProjectId, currentYear, currentMonth], async () => {
  if (!selectedProjectId.value) return
  const projects = await getProjects()
  const p = projects.find(p => p.id === selectedProjectId.value)
  if (p) {
    projectName.value = p.name
    projectIcon.value = p.icon
  }
  const checkins = await getCheckIns(selectedProjectId.value, currentYear.value, currentMonth.value)
  checkedCount.value = checkins.length
}, { immediate: true })

const props = defineProps<{ widgetId?: number }>()
const posKey = `sticky-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const saved = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(saved?.x ?? 80)
const y = ref(saved?.y ?? 12)
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
  <div class="sticky-note" :style="{ left: x + 'px', top: y + 'px' }">
    <div class="sticky-drag-bar" @mousedown="onDragStart"><span class="drag-dots">⋮⋮</span></div>
    <strong>{{ projectIcon }} {{ projectName }}</strong>
    本月已打卡：{{ checkedCount }} / {{ totalDays }} 天
    <span class="sticky-encourage">{{ checkedCount === totalDays ? '🎉 全勤！太棒了！' : '加油，坚持就是胜利 ✊' }}</span>
  </div>
</template>

<style scoped>
.sticky-note {
  position: absolute; width: 180px; padding: 26px 14px 18px;
  background: #fff385; transform: rotate(-7deg);
  box-shadow: 8px 8px 16px rgba(0,0,0,0.2); z-index: 56;
  font-size: 0.8rem; color: #555;
  border-bottom-right-radius: 60px 5px; line-height: 1.5;
}
.sticky-drag-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 22px;
  background: rgba(0,0,0,0.08); display: flex; align-items: center; justify-content: center;
  cursor: grab; opacity: 0; transition: opacity 0.2s; border-radius: 3px 3px 0 0;
}
.sticky-note:hover .sticky-drag-bar { opacity: 1; }
.sticky-drag-bar:active { cursor: grabbing; background: rgba(0,0,0,0.14); }
.drag-dots { color: rgba(0,0,0,0.35); font-size: 16px; letter-spacing: 4px; user-select: none; }
.sticky-note strong { color: #d35400; display: block; margin-bottom: 4px; }
.sticky-encourage { font-size: 0.75rem; color: #999; display: block; margin-top: 4px; }
</style>
