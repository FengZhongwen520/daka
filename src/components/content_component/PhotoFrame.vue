<script setup lang="ts">
import { computed, ref, onMounted, watch, onUnmounted } from 'vue'
import { db } from '../../db'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import { usePhotoCropGeometry } from '../../composables/usePhotoCropGeometry'
import DragBar from '../common/DragBar.vue'
import PhotoCropEditor from './PhotoCropEditor.vue'

const props = defineProps<{ position?: 'left' | 'right'; widgetId?: number; initialX?: number; initialY?: number }>()
const uid = props.widgetId != null ? String(props.widgetId) : (props.position || 'r' + Math.random().toString(36).slice(2, 6))
const dbKey = `photo-${uid}`
const posKey = `photo-frame-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(
  props,
  posKey,
  props.position === 'left' ? 60 : 820,
  200,
  true,
)

// Frame size
const sizeKey = `photo-frame-size-${uid}`
const savedSize = JSON.parse(localStorage.getItem(sizeKey) || 'null')
const frameWidth = ref(Number(savedSize?.width) || 190)
const frameHeight = ref(Number(savedSize?.height) || 238)
const frameStyle = computed(() => ({
  width: `${frameWidth.value}px`,
  height: `${frameHeight.value}px`,
}))
watch([frameWidth, frameHeight], () => {
  localStorage.setItem(sizeKey, JSON.stringify({
    width: frameWidth.value,
    height: frameHeight.value,
  }))
})

interface PhotoView { x: number; y: number; zoom: number }

const viewKey = `photo-frame-views-${uid}`
const savedViews = JSON.parse(localStorage.getItem(viewKey) || '{}') as Record<string, PhotoView>
const photoViews = ref<Record<string, PhotoView>>(savedViews)
const panX = ref(50)
const panY = ref(50)
const zoom = ref(1)
const cropEditorOpen = ref(false)
const photoWindowRef = ref<HTMLElement>()
const cropAspectRatio = computed(() => {
  const photoWidth = Math.max(100, frameWidth.value - 20)
  const photoHeight = Math.max(120, frameHeight.value - 41)
  return photoWidth / photoHeight
})
const {
  imageStyle: photoStyle,
  onImageLoad: onPhotoLoad,
} = usePhotoCropGeometry(
  photoWindowRef,
  () => ({ x: panX.value, y: panY.value, zoom: zoom.value }),
)

function loadCurrentView() {
  const view = photoViews.value[currentIndex.value] || { x: 50, y: 50, zoom: 1 }
  panX.value = Math.min(100, Math.max(0, view.x))
  panY.value = Math.min(100, Math.max(0, view.y))
  zoom.value = Math.min(3, Math.max(1, view.zoom))
}

function persistCurrentView() {
  if (photos.value.length === 0) return
  photoViews.value = {
    ...photoViews.value,
    [currentIndex.value]: {
      x: panX.value,
      y: panY.value,
      zoom: zoom.value,
    },
  }
  localStorage.setItem(viewKey, JSON.stringify(photoViews.value))
}

function openCropEditor() {
  if (photos.value.length === 0) return
  clearInterval(slideTimer!)
  cropEditorOpen.value = true
}

function saveCrop(view: PhotoView) {
  panX.value = view.x
  panY.value = view.y
  zoom.value = view.zoom
  persistCurrentView()
  cropEditorOpen.value = false
}

watch(cropEditorOpen, (open) => {
  if (open) clearInterval(slideTimer!)
  else startSlide()
})

// Photos from DB
const photos = ref<string[]>([])
const currentIndex = ref(0)
let slideTimer: ReturnType<typeof setInterval> | null = null
const fileRef = ref<HTMLInputElement>()

onMounted(async () => {
  const rows = await db.photos.where('position').equals(dbKey).toArray()
  photos.value = rows.map(r => r.dataUrl).filter(Boolean)
  loadCurrentView()
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
  if (photos.value.length > 1) {
    slideTimer = setInterval(() => {
      persistCurrentView()
      currentIndex.value = (currentIndex.value + 1) % photos.value.length
    }, 4000)
  }
}

watch(currentIndex, loadCurrentView)

let resizingFrame = false
let resizeStartX = 0
let resizeStartY = 0
let resizeStartWidth = 0

function beginFrameResize(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  resizingFrame = true
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartWidth = frameWidth.value
  window.addEventListener('pointermove', onFrameResizeMove, { passive: false })
  window.addEventListener('pointerup', finishFrameResize, { once: true })
}

function onFrameResizeMove(event: PointerEvent) {
  if (!resizingFrame) return
  event.preventDefault()
  const delta = ((event.clientX - resizeStartX) + (event.clientY - resizeStartY)) / 2
  const nextWidth = Math.min(420, Math.max(160, resizeStartWidth + delta))
  frameWidth.value = Math.round(nextWidth)
  frameHeight.value = Math.round(nextWidth * 1.25)
}

function finishFrameResize() {
  resizingFrame = false
  window.removeEventListener('pointermove', onFrameResizeMove)
  window.removeEventListener('pointerup', finishFrameResize)
}

function nudgeFrameSize(event: KeyboardEvent) {
  const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    ? 12
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? -12
      : 0
  if (!delta) return
  event.preventDefault()
  const nextWidth = Math.min(420, Math.max(160, frameWidth.value + delta))
  frameWidth.value = nextWidth
  frameHeight.value = Math.round(nextWidth * 1.25)
}

function resetFrameSize() {
  frameWidth.value = 190
  frameHeight.value = 238
}

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
  loadCurrentView()
  await saveAll()
  if (photos.value.length > 1) startSlide()
  cropEditorOpen.value = true
  if (fileRef.value) fileRef.value.value = ''
}

async function removeCurrent() {
  if (photos.value.length > 1) {
    photoViews.value = {}
    localStorage.removeItem(viewKey)
    photos.value.splice(currentIndex.value, 1)
    if (currentIndex.value >= photos.value.length) currentIndex.value = photos.value.length - 1
    await saveAll()
    loadCurrentView()
    if (photos.value.length <= 1) clearInterval(slideTimer!)
  } else {
    photos.value = []
    photoViews.value = {}
    localStorage.removeItem(viewKey)
    await saveAll()
    clearInterval(slideTimer!)
  }
}

function next(e: Event) {
  e.stopPropagation()
  if (photos.value.length <= 1) return
  persistCurrentView()
  currentIndex.value = (currentIndex.value + 1) % photos.value.length
}

function prev(e: Event) {
  e.stopPropagation()
  if (photos.value.length <= 1) return
  persistCurrentView()
  currentIndex.value = (currentIndex.value - 1 + photos.value.length) % photos.value.length
}

onUnmounted(() => {
  clearInterval(slideTimer!)
  finishFrameResize()
})
</script>

<template>
  <div
    class="photo-frame widget-card"
    :style="{ left: x + 'px', top: y + 'px', ...frameStyle }"
  >
    <DragBar variant="overlay" :on-drag-start="onDragStart" />
    <div class="frame-inset">
      <div
        ref="photoWindowRef"
        class="photo-window"
        :class="{ empty: photos.length === 0 }"
        @dblclick.stop="openCropEditor"
      >
        <button
          v-if="photos.length === 0"
          type="button"
          class="photo-placeholder"
          @click.stop="fileRef?.click()"
        >
          <span aria-hidden="true">＋</span>
          <small>添加照片</small>
        </button>
        <template v-else>
          <img
            :src="photos[currentIndex]"
            class="photo-img"
            :style="photoStyle"
            :alt="`照片 ${currentIndex + 1}`"
            draggable="false"
            @load="onPhotoLoad"
          />
          <button
            type="button"
            class="photo-del"
            aria-label="删除当前照片"
            title="删除当前照片"
            @pointerdown.stop
            @click.stop="removeCurrent"
          >✕</button>
          <template v-if="photos.length > 1">
            <button
              type="button"
              class="photo-nav photo-prev"
              aria-label="上一张"
              @pointerdown.stop
              @click.stop="prev"
            >‹</button>
            <button
              type="button"
              class="photo-nav photo-next"
              aria-label="下一张"
              @pointerdown.stop
              @click.stop="next"
            >›</button>
          </template>
          <div class="photo-toolbar" @pointerdown.stop @dblclick.stop>
            <button type="button" class="photo-edit-btn" @click.stop="openCropEditor">取景</button>
            <span>{{ Math.round(zoom * 100) }}%</span>
            <button type="button" title="更换或添加照片" @click.stop="fileRef?.click()">换</button>
          </div>
        </template>
      </div>

      <div class="frame-caption">
        <span>MEMORIES</span>
        <div v-if="photos.length > 1" class="photo-dots" aria-label="照片切换">
          <button
            v-for="(_, i) in photos"
            :key="i"
            type="button"
            class="photo-dot"
            :class="{ active: i === currentIndex }"
            :aria-label="`查看第 ${i + 1} 张照片`"
            :aria-pressed="i === currentIndex"
            @click.stop="persistCurrentView(); currentIndex = i"
          />
        </div>
        <span>{{ photos.length ? `${currentIndex + 1} / ${photos.length}` : 'NO PHOTO' }}</span>
      </div>
    </div>
    <button
      type="button"
      class="photo-resize-handle"
      title="拖动调整相框大小，方向键微调，双击恢复默认"
      aria-label="调整相框大小"
      @pointerdown="beginFrameResize"
      @keydown="nudgeFrameSize"
      @dblclick.stop="resetFrameSize"
    />
  </div>
  <input ref="fileRef" type="file" accept="image/*" multiple style="display:none" @change="onFilesChange" />
  <PhotoCropEditor
    v-model="cropEditorOpen"
    :src="photos[currentIndex] || ''"
    :initial="{ x: panX, y: panY, zoom }"
    :aspect-ratio="cropAspectRatio"
    @save="saveCrop"
  />
</template>

<style scoped>
/* Gallery frame: warm matte, dark inner liner and restrained paper shadows. */
.photo-frame {
  --frame-matte: #f4efe5;
  --frame-matte-deep: #e8e0d2;
  --frame-ink: #594f42;
  position: absolute;
  min-width: 160px;
  min-height: 200px;
  padding: 0;
  border-radius: 13px;
  border: 1px solid rgba(104, 88, 66, 0.22);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.65), transparent 42%),
    var(--frame-matte);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.82) inset,
    0 2px 5px rgba(42, 33, 22, 0.12),
    0 18px 42px rgba(42, 33, 22, 0.17);
  cursor: default;
  transition: box-shadow 180ms ease, border-color 180ms ease;
  overflow: hidden;
  z-index: 55;
}
.photo-frame::after {
  content: "";
  position: absolute;
  z-index: 5;
  inset: 4px;
  border: 1px solid rgba(110, 92, 67, 0.12);
  border-radius: 10px;
  pointer-events: none;
}
.photo-frame:hover {
  border-color: rgba(104, 88, 66, 0.32);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 3px 7px rgba(42, 33, 22, 0.14),
    0 24px 54px rgba(42, 33, 22, 0.2);
}
.photo-frame:hover :deep(.drag-bar--overlay) { opacity: 1; }

.frame-inset {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 9px 9px 6px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.18), transparent 55%);
}

.photo-window {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  border-radius: 5px;
  background: #10151d;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.1) inset,
    0 2px 5px rgba(0, 0, 0, 0.28) inset;
  isolation: isolate;
  cursor: default;
  touch-action: none;
}
.photo-window::after {
  content: "";
  position: absolute;
  z-index: 3;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.13), transparent 26% 72%, rgba(255, 255, 255, 0.035));
  pointer-events: none;
}

.photo-img {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  max-width: none;
  max-height: none;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
  transition: transform 140ms ease-out;
}
.photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  background:
    radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.08), transparent 55%),
    #17202b;
  color: rgba(255, 255, 255, 0.62);
  cursor: pointer;
  font-family: inherit;
}
.photo-placeholder > span {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  font-size: 27px;
  font-weight: 300;
}
.photo-placeholder small {
  font-size: 0.62rem;
  letter-spacing: 0.08em;
}

.frame-caption {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 3px 0;
  color: var(--frame-ink);
  font-size: 0.48rem;
  font-weight: 720;
  letter-spacing: 0.12em;
  line-height: 1;
}

.photo-toolbar {
  position: absolute;
  z-index: 4;
  left: 50%;
  bottom: 7px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  background: rgba(10, 16, 24, 0.62);
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.28);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 4px);
  transition: opacity 150ms ease, transform 150ms ease;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.photo-frame:hover .photo-toolbar,
.photo-frame:focus-within .photo-toolbar {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
}
.photo-toolbar button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.76);
  cursor: pointer;
  font: 650 0.62rem/1 var(--font-family);
}
.photo-toolbar button:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
.photo-toolbar .photo-edit-btn {
  width: auto;
  min-width: 32px;
  padding: 0 7px;
  background: color-mix(in srgb, var(--color-primary) 22%, rgba(10, 16, 24, 0.62));
  color: #8ff3d9;
}
.photo-toolbar .photo-edit-btn:hover {
  background: color-mix(in srgb, var(--color-primary) 40%, rgba(10, 16, 24, 0.62));
  color: #fff;
}
.photo-toolbar span {
  min-width: 31px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.52rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.photo-toolbar i {
  width: 1px;
  height: 15px;
  margin: 0 2px;
  background: rgba(255, 255, 255, 0.14);
}

.photo-del {
  position: absolute;
  z-index: 4;
  top: 7px;
  right: 7px;
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  background: rgba(8, 13, 20, 0.54);
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  font-size: 10px;
  opacity: 0;
  transition: opacity 150ms ease, background 150ms ease;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.photo-frame:hover .photo-del,
.photo-frame:focus-within .photo-del { opacity: 1; }
.photo-del:hover { background: rgba(180, 42, 42, 0.72); color: #fff; }

.photo-nav {
  position: absolute;
  z-index: 4;
  top: 44%;
  width: 26px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(8, 13, 20, 0.46);
  color: rgba(255, 255, 255, 0.86);
  cursor: pointer;
  font-size: 18px;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 150ms ease, background 150ms ease;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.photo-frame:hover .photo-nav,
.photo-frame:focus-within .photo-nav { opacity: 1; }
.photo-prev { left: 6px; }
.photo-next { right: 6px; }
.photo-nav:hover { background: rgba(8, 13, 20, 0.72); }

.photo-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.photo-dot {
  width: 5px;
  height: 5px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(89, 79, 66, 0.28);
  cursor: pointer;
  transition: width 150ms ease, background 150ms ease;
}
.photo-dot.active { width: 12px; border-radius: 999px; background: #2da989; }

.photo-resize-handle {
  position: absolute;
  z-index: 7;
  right: 5px;
  bottom: 5px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: nwse-resize;
  touch-action: none;
}
.photo-resize-handle::before,
.photo-resize-handle::after {
  content: "";
  position: absolute;
  right: 4px;
  bottom: 4px;
  border-right: 1.5px solid color-mix(in srgb, var(--frame-ink) 55%, transparent);
  border-bottom: 1.5px solid color-mix(in srgb, var(--frame-ink) 55%, transparent);
}
.photo-resize-handle::before { width: 11px; height: 11px; }
.photo-resize-handle::after { width: 6px; height: 6px; }
.photo-resize-handle:focus-visible { box-shadow: var(--focus-ring); border-radius: 6px; }

html.dark .photo-frame {
  --frame-matte: #252b33;
  --frame-matte-deep: #1b2027;
  --frame-ink: #b8b1a6;
  border-color: rgba(255, 255, 255, 0.09);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.08), transparent 45%),
    var(--frame-matte);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.07) inset,
    0 2px 6px rgba(0, 0, 0, 0.35),
    0 20px 48px rgba(0, 0, 0, 0.42);
}
html.dark .photo-frame::after { border-color: rgba(255, 255, 255, 0.07); }
</style>
