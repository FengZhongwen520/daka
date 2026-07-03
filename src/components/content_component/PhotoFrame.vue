<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { getPhoto } from '../../db'

const props = defineProps<{ position?: 'left' | 'right'; widgetId?: number; initialX?: number; initialY?: number }>()
const photoKey = `photo-${props.widgetId ?? props.position ?? 'default'}`

// Position
const defaults = props.position === 'left' ? { x: 60, y: 200 } : { x: 820, y: 200 }
const posKey = `photo-pos-${props.widgetId ?? props.position ?? 'default'}`
const saved = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(saved?.x ?? props.initialX ?? defaults.x)
const y = ref(saved?.y ?? props.initialY ?? defaults.y)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))

// Photos array (support both single and multiple)
const photos = ref<string[]>([])
const currentIndex = ref(0)
const slideshow = ref(false)
let slideTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  const saved = localStorage.getItem(photoKey + '-data')
  if (saved) {
    try { photos.value = JSON.parse(saved) } catch { photos.value = [] }
  } else {
    const p = await getPhoto(photoKey)
    if (p?.dataUrl) photos.value = [p.dataUrl]
  }
  if (photos.value.length > 1) startSlideshow()
})

function saveData() {
  localStorage.setItem(photoKey + '-data', JSON.stringify(photos.value))
}

function startSlideshow() {
  slideshow.value = true
  clearInterval(slideTimer!)
  if (photos.value.length > 1) {
    slideTimer = setInterval(() => {
      currentIndex.value = (currentIndex.value + 1) % photos.value.length
    }, 4000)
  }
}

function stopSlideshow() {
  slideshow.value = false
  clearInterval(slideTimer!)
  slideTimer = null
}

onUnmounted(() => clearInterval(slideTimer!))

// Drag
let dragMoved = false, dragging = false, sx = 0, sy = 0, ix = 0, iy = 0
function onDragStart(e: MouseEvent) {
  dragging = true; dragMoved = false
  sx = e.clientX; sy = e.clientY; ix = x.value; iy = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) {
  if (!dragging) return
  const dx = e.clientX - sx, dy = e.clientY - sy
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true
  x.value = ix + dx; y.value = iy + dy
}
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }

function onClickFrame() { if (!dragMoved) triggerUpload() }

const fileInput = ref<HTMLInputElement>()

function triggerUpload() { fileInput.value?.click() }

async function onFilesChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files || files.length === 0) return
  const readers: Promise<string>[] = []
  for (const file of files) {
    readers.push(new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    }))
  }
  const results = await Promise.all(readers)
  if (files.length === 1 && photos.value.length === 0) {
    photos.value = [results[0]]
  } else {
    photos.value = [...photos.value, ...results]
  }
  currentIndex.value = photos.value.length - results.length
  saveData()
  if (photos.value.length > 1 && !slideshow.value) startSlideshow()
}

async function onDelete(e: Event) {
  e.stopPropagation()
  if (photos.value.length > 1) {
    // Delete current photo from array
    photos.value.splice(currentIndex.value, 1)
    if (currentIndex.value >= photos.value.length) currentIndex.value = 0
    saveData()
    if (photos.value.length <= 1) stopSlideshow()
  } else {
    photos.value = []
    saveData()
    stopSlideshow()
  }
}

function nextPhoto(e: Event) {
  e.stopPropagation()
  e.preventDefault()
  if (photos.value.length <= 1) return
  stopSlideshow()
  currentIndex.value = (currentIndex.value + 1) % photos.value.length
}

function prevPhoto(e: Event) {
  e.stopPropagation()
  e.preventDefault()
  if (photos.value.length <= 1) return
  stopSlideshow()
  currentIndex.value = (currentIndex.value - 1 + photos.value.length) % photos.value.length
}
</script>

<template>
  <div class="photo-frame" :style="{ left: x + 'px', top: y + 'px' }" @click="onClickFrame">
    <div class="photo-drag-bar" @mousedown.stop="onDragStart"><span class="drag-dots">⋮⋮</span></div>

    <!-- Empty -->
    <span v-if="photos.length === 0" class="photo-placeholder">+</span>

    <!-- Photos -->
    <template v-else>
      <img :src="photos[currentIndex]" class="photo-img" />
      <!-- Multi-photo nav -->
      <template v-if="photos.length > 1">
        <button class="photo-nav photo-prev" @click.stop="prevPhoto">‹</button>
        <button class="photo-nav photo-next" @click.stop="nextPhoto">›</button>
        <div class="photo-dots">
          <span v-for="(_, i) in photos" :key="i" class="photo-dot" :class="{ active: i === currentIndex }" @click.stop="currentIndex = i"></span>
        </div>
      </template>
      <button class="photo-del" @click.stop="onDelete">✕</button>
    </template>
  </div>
  <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onFilesChange" />
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

/* Multi-photo nav */
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
  background: rgba(255,255,255,0.5); cursor: pointer;
  transition: all 0.2s;
}
.photo-dot.active { background: #fff; transform: scale(1.3); }
</style>
