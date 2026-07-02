<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getPhoto, savePhoto, deletePhoto } from '../../db'

const props = defineProps<{ position?: 'left' | 'right'; widgetId?: number }>()

// Unique key per instance
const photoKey = `photo-${props.widgetId ?? props.position ?? 'default'}`

// Position
const defaults = props.position === 'left'
  ? { x: 60, y: 200 }
  : { x: 820, y: 200 }
const posKey = `photo-pos-${props.widgetId ?? props.position ?? 'default'}`
const saved = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(saved?.x ?? defaults.x)
const y = ref(saved?.y ?? defaults.y)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))

// Drag with click suppression
let dragMoved = false, dragging = false, startX = 0, startY = 0, initX = 0, initY = 0
function onDragStart(e: MouseEvent) {
  dragging = true; dragMoved = false
  startX = e.clientX; startY = e.clientY; initX = x.value; initY = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) {
  if (!dragging) return
  const dx = e.clientX - startX, dy = e.clientY - startY
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true
  x.value = initX + dx; y.value = initY + dy
}
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }

function onClickFrame() { if (!dragMoved) triggerUpload() }

const photo = ref<string | null>(null)
const fileInput = ref<HTMLInputElement>()

onMounted(async () => {
  const p = await getPhoto(photoKey)
  if (p) photo.value = p.dataUrl
})

function triggerUpload() { fileInput.value?.click() }

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    const dataUrl = reader.result as string
    await savePhoto(photoKey, dataUrl)
    photo.value = dataUrl
  }
  reader.readAsDataURL(file)
}

async function onDelete() {
  await deletePhoto(photoKey)
  photo.value = null
}
</script>

<template>
  <div class="photo-frame" :style="{ left: x + 'px', top: y + 'px' }" @click="onClickFrame">
    <div class="photo-drag-bar" @mousedown.stop="onDragStart"><span class="drag-dots">⋮⋮</span></div>
    <img v-if="photo" :src="photo" class="photo-img" />
    <span v-else class="photo-placeholder">+</span>
    <button v-if="photo" class="photo-del" @click.stop="onDelete">✕</button>
  </div>
  <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileChange" />
</template>

<style scoped>
.photo-frame {
  position: absolute; width: 160px; height: 200px; background: #fff;
  border-radius: 3px; box-shadow: 2px 2px 0 #ddd, 8px 10px 20px rgba(0,0,0,0.25);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; transition: box-shadow 0.3s; overflow: hidden; z-index: 55;
}
.photo-frame:hover { box-shadow: 4px 4px 0 #ddd, 12px 14px 28px rgba(0,0,0,0.3); }
.photo-drag-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 22px;
  background: rgba(0,0,0,0.08); display: flex; align-items: center; justify-content: center;
  cursor: grab; z-index: 3; opacity: 0; transition: opacity 0.2s;
}
.photo-frame:hover .photo-drag-bar { opacity: 1; }
.photo-drag-bar:active { cursor: grabbing; background: rgba(0,0,0,0.14); }
.drag-dots { color: rgba(0,0,0,0.35); font-size: 16px; letter-spacing: 4px; user-select: none; }
.photo-placeholder { font-size: 48px; color: #d1d8e0; font-weight: 200; margin-top: 8px; }
.photo-img { width: 100%; height: 100%; object-fit: cover; }
.photo-del {
  position: absolute; top: 6px; right: 6px; width: 24px; height: 24px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  border: none; cursor: pointer; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.2s; z-index: 4;
}
.photo-frame:hover .photo-del { opacity: 1; }
</style>
