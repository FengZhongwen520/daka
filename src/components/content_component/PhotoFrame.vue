<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { db, updateWidgetPos } from '../../db'
import DragBar from '../common/DragBar.vue'

const props = defineProps<{ position?: 'left' | 'right'; widgetId?: number; initialX?: number; initialY?: number }>()
const uid = props.widgetId != null ? String(props.widgetId) : (props.position || 'r' + Math.random().toString(36).slice(2, 6))
const dbKey = `photo-${uid}`
const posKey = `pf-pos-${uid}`

// Position
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? props.initialX ?? (props.position === 'left' ? 60 : 820))
const y = ref(savedPos?.y ?? props.initialY ?? 200)
watch([x, y], () => {
  localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value }))
  if (props.widgetId != null) updateWidgetPos(props.widgetId, x.value, y.value)
})

// Photos from DB
const photos = ref<string[]>([])
const currentIndex = ref(0)
let slideTimer: ReturnType<typeof setInterval> | null = null
const fileRef = ref<HTMLInputElement>()

onMounted(async () => {
  const rows = await db.photos.where('position').equals(dbKey).toArray()
  photos.value = rows.map(r => r.dataUrl).filter(Boolean)
  if (photos.value.length > 1) startSlide()
})

async function saveAll() {
  await db.photos.where('position').equals(dbKey).delete()
  for (const url of photos.value) {
    await db.photos.add({ position: dbKey as any, dataUrl: url, createdAt: new Date() })
  }
}

function startSlide() {
  clearInterval(slideTimer!)
  if (photos.value.length > 1) slideTimer = setInterval(() => { currentIndex.value = (currentIndex.value + 1) % photos.value.length }, 4000)
}
onUnmounted(() => clearInterval(slideTimer!))

// Drag
let dragMoved = false, dragging = false, sx = 0, sy = 0, ix = 0, iy = 0
function onDragStart(e: MouseEvent) {
  dragging = true; dragMoved = false; sx = e.clientX; sy = e.clientY; ix = x.value; iy = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) {
  if (!dragging) return
  if (Math.abs(e.clientX - sx) > 2 || Math.abs(e.clientY - sy) > 2) dragMoved = true
  x.value = ix + (e.clientX - sx); y.value = iy + (e.clientY - sy)
}
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }

function onFrameClick() { if (!dragMoved) fileRef.value?.click() }

async function onFilesChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files || files.length === 0) return
  const results: string[] = []
  for (const file of files) {
    results.push(await new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(file) }))
  }
  if (files.length === 1 && photos.value.length === 0) photos.value = [results[0]]
  else photos.value = [...photos.value, ...results]
  currentIndex.value = photos.value.length - results.length
  await saveAll()
  if (photos.value.length > 1) startSlide()
  if (fileRef.value) fileRef.value.value = ''
}

async function removeCurrent() {
  if (photos.value.length > 1) {
    photos.value.splice(currentIndex.value, 1)
    if (currentIndex.value >= photos.value.length) currentIndex.value = photos.value.length - 1
    await saveAll()
    if (photos.value.length <= 1) clearInterval(slideTimer!)
  } else { photos.value = []; await saveAll(); clearInterval(slideTimer!) }
}

function next(e: Event) { e.stopPropagation(); if (photos.value.length > 1) currentIndex.value = (currentIndex.value + 1) % photos.value.length }
function prev(e: Event) { e.stopPropagation(); if (photos.value.length > 1) currentIndex.value = (currentIndex.value - 1 + photos.value.length) % photos.value.length }
</script>

<template>
  <div class="photo-frame" :style="{ left: x + 'px', top: y + 'px' }" @click="onFrameClick">
    <DragBar variant="overlay" :on-drag-start="onDragStart" />
    <span v-if="photos.length === 0" class="photo-placeholder">+</span>
    <template v-else>
      <img :src="photos[currentIndex]" class="photo-img" />
      <template v-if="photos.length > 1">
        <button class="photo-nav photo-prev" @click.stop="prev">‹</button>
        <button class="photo-nav photo-next" @click.stop="next">›</button>
        <div class="photo-dots">
          <span v-for="(_, i) in photos" :key="i" class="photo-dot" :class="{ active: i === currentIndex }" @click.stop="currentIndex = i"></span>
        </div>
      </template>
      <button class="photo-del" @click.stop="removeCurrent">✕</button>
    </template>
  </div>
  <input ref="fileRef" type="file" accept="image/*" multiple style="display:none" @change="onFilesChange" />
</template>

<style scoped>
/* Physical paper object — matte stays light in both themes */
.photo-frame {
  position: absolute; width: 160px; height: 200px; background: var(--color-paper);
  border-radius: 3px; box-shadow: 2px 2px 0 var(--color-line), 8px 10px 20px rgba(0,0,0,0.25);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; transition: box-shadow 0.3s; overflow: hidden; z-index: 55;
}
.photo-frame:hover { box-shadow: 4px 4px 0 var(--color-line), 12px 14px 28px rgba(0,0,0,0.3); }
.photo-frame:hover :deep(.drag-bar--overlay) { opacity: 1; }
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
.photo-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 26px; height: 26px; border-radius: 50%; border: none;
  background: rgba(0,0,0,0.3); color: #fff; cursor: pointer;
  font-size: 16px; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.2s; z-index: 4;
}
.photo-frame:hover .photo-nav { opacity: 1; }
.photo-prev { left: 4px; }
.photo-next { right: 4px; }
.photo-nav:hover { background: rgba(0,0,0,0.5); }
.photo-dots {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 4px; z-index: 4; opacity: 0; transition: opacity 0.2s;
}
.photo-frame:hover .photo-dots { opacity: 1; }
.photo-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.2s;
}
.photo-dot.active { background: #fff; transform: scale(1.3); }
</style>
