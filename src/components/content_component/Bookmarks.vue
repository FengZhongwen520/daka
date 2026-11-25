<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  addSiteItem,
  addSiteItems,
  clearSites,
  getSites,
  removeSiteItem,
} from '../../db'
import type { BookmarkSource, SiteItem } from '../../db'
import FaviconImg from '../FaviconImg.vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'
import { askConfirm, notify } from '../../utils/feedback'

interface BookmarkLink {
  url: string
  title: string
}

interface ImportFolder {
  name: string
  bookmarks: BookmarkLink[]
}

interface ImportMeta {
  folder: string
  fileName: string
  importedAt: string
}

interface CardSize {
  cols: number
  rows: number
}

type ResizeAxis = 'width' | 'height' | 'both'

const CELL_WIDTH = 96
const CELL_HEIGHT = 96
const GRID_GAP = 10
const BODY_PAD_X = 12
const BODY_PAD_Y = 26
const HEADER_HEIGHT = 0
const IMPORT_SUMMARY_HEIGHT = 50
const MIN_COLS = 1
const MIN_ROWS = 1
const MAX_COLS = 8
const MAX_ROWS = 8

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const widgetType = inject<string>('widgetType', 'bookmarks')
const source = computed<BookmarkSource>(() => widgetType === 'bookmarks-import' ? 'imported' : 'custom')
const isImport = computed(() => source.value === 'imported')
const wid = computed(() => props.widgetId ?? 0)
const sitesCacheKey = computed(() => `bookmarks-sites-${wid.value}-${source.value}`)
const sites = ref<SiteItem[]>([])
const loaded = ref(false)

function readStoredJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

const cachedSites = readStoredJson(sitesCacheKey.value)
if (Array.isArray(cachedSites)) {
  sites.value = cachedSites as SiteItem[]
  loaded.value = true
}

const formTitleId = `bm-form-title-${props.widgetId ?? 'new'}`

// Card size is expressed only in complete icon cells.
const sizeKey = `bm-size${props.widgetId != null ? '-' + props.widgetId : ''}`
const legacyLayoutKey = `bm-layout${props.widgetId != null ? '-' + props.widgetId : ''}`

function normalizeCellCount(value: unknown, max: number): number | null {
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1) return null
  return Math.min(count, max)
}

function readCardSize(): CardSize {
  const saved = readStoredJson(sizeKey)
  if (saved && typeof saved === 'object') {
    const candidate = saved as Partial<CardSize>
    const cols = normalizeCellCount(candidate.cols, MAX_COLS)
    const rows = normalizeCellCount(candidate.rows, MAX_ROWS)
    if (cols && rows) return { cols, rows }
  }

  const legacy = localStorage.getItem(legacyLayoutKey) || ''
  if (legacy === 'list' || legacy === '2x4') return { cols: 2, rows: 4 }
  if (legacy === '4x2') return { cols: 4, rows: 2 }
  if (legacy === 'compact' || legacy === '4x4') return { cols: 4, rows: 3 }
  return { cols: 3, rows: 3 }
}

const cardSize = ref<CardSize>(readCardSize())
watch(cardSize, value => {
  localStorage.setItem(sizeKey, JSON.stringify({
    cols: normalizeCellCount(value.cols, MAX_COLS) ?? 3,
    rows: normalizeCellCount(value.rows, MAX_ROWS) ?? 3,
  }))
}, { deep: true })

const iconSize = computed(() => {
  if (cardSize.value.cols === 1) return 28
  return cardSize.value.cols >= 4 ? 32 : 38
})
const displaySlots = computed<(SiteItem | null)[]>(() => {
  return isImport.value ? [...sites.value] : [...sites.value, null]
})

// Add form
const showAdd = ref(false)
const addDraft = ref({ url: '', title: '' })
const urlInput = ref<HTMLInputElement>()
const saving = ref(false)

const previewUrl = computed(() => {
  if (!addDraft.value.url.trim()) return ''
  return normalizeUrl(addDraft.value.url) || ''
})
const previewDomain = computed(() => siteDomain(previewUrl.value))
const previewTitle = computed(() => {
  return addDraft.value.title.trim() || previewDomain.value || '新网站'
})

function openAddPanel() {
  addDraft.value = { url: '', title: '' }
  showAdd.value = true
  nextTick(() => {
    urlInput.value?.focus()
  })
}

function closeAddPanel() {
  if (saving.value) return
  showAdd.value = false
}

function resetDraft() {
  addDraft.value = { url: '', title: '' }
  nextTick(() => urlInput.value?.focus())
}

async function submitAdd(keepOpen = false) {
  if (saving.value) return
  const url = normalizeUrl(addDraft.value.url)
  if (!url) {
    notify('请输入有效的 http 或 https 网址', 'warning')
    urlInput.value?.focus()
    return
  }

  const duplicate = sites.value.some(site => urlKey(site.url) === urlKey(url))
  if (duplicate) {
    notify('这个网站已经在收藏夹里了', 'warning')
    return
  }

  saving.value = true
  try {
    const displayTitle = addDraft.value.title.trim() || siteDomain(url)
    await addSiteItem(url, displayTitle, wid.value, source.value)
    await loadSites()
    notify(`已添加「${displayTitle}」`, 'success')
    if (keepOpen) {
      resetDraft()
    } else {
      showAdd.value = false
    }
  } finally {
    saving.value = false
  }
}

async function removeSite(id?: number) {
  if (id == null) return
  await removeSiteItem(id)
  await loadSites()
}

function siteInitial(text: string) {
  return (text || '?').charAt(0).toUpperCase()
}

function initialColor(text: string) {
  const colors = ['#d96b6b', '#2a9d7f', '#4f7fd9', '#c9892d', '#8467c7', '#c35c91', '#258ca3']
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function normalizeUrl(raw: string): string | null {
  let value = raw.trim()
  if (!value) return null
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) value = `https://${value}`
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function urlKey(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ''
    return url.href.replace(/\/$/, '').toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

function siteDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function loadSites() {
  sites.value = await getSites(wid.value, source.value)
  localStorage.setItem(sitesCacheKey.value, JSON.stringify(sites.value))
}

// Browser bookmark import
const importFolders = ref<ImportFolder[]>([])
const importMetaKey = `bm-import-meta${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedImportMeta = readStoredJson(importMetaKey)
const importMeta = ref<ImportMeta | null>(
  savedImportMeta && typeof savedImportMeta === 'object'
    ? savedImportMeta as ImportMeta
    : null,
)
const fileInput = ref<HTMLInputElement>()
const dragActive = ref(false)
const pendingFileName = ref('')
let dragDepth = 0

const totalImportCount = computed(() => {
  return importFolders.value.reduce((sum, folder) => sum + folder.bookmarks.length, 0)
})

function triggerImport() {
  fileInput.value?.click()
}

function directChild<T extends Element>(parent: Element, tagName: string): T | null {
  const child = Array.from(parent.children).find(item => item.tagName === tagName)
  return child ? child as T : null
}

function bookmarkFromAnchor(anchor: HTMLAnchorElement): BookmarkLink | null {
  const rawUrl = anchor.getAttribute('href')?.trim() || ''
  const url = normalizeUrl(rawUrl)
  if (!url) return null
  return {
    url,
    title: anchor.textContent?.trim() || siteDomain(url),
  }
}

function uniqueLinks(links: BookmarkLink[]): BookmarkLink[] {
  const seen = new Set<string>()
  return links.filter(link => {
    const key = urlKey(link.url)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function directLinksIn(dl: Element): BookmarkLink[] {
  const links: BookmarkLink[] = []
  for (const dt of Array.from(dl.children)) {
    if (dt.tagName !== 'DT') continue
    const anchor = directChild<HTMLAnchorElement>(dt, 'A')
    if (!anchor) continue
    const bookmark = bookmarkFromAnchor(anchor)
    if (bookmark) links.push(bookmark)
  }
  return uniqueLinks(links)
}

function parseFolder(dt: Element): ImportFolder[] {
  const heading = directChild<HTMLElement>(dt, 'H3')
  if (!heading) return []

  const folder: ImportFolder = {
    name: heading.textContent?.trim() || '未命名分组',
    bookmarks: [],
  }
  const nestedFolders: ImportFolder[] = []
  const nestedList = directChild<HTMLElement>(dt, 'DL')

  if (nestedList) {
    folder.bookmarks = directLinksIn(nestedList)
    for (const nestedDt of Array.from(nestedList.children)) {
      if (nestedDt.tagName !== 'DT' || !directChild(nestedDt, 'H3')) continue
      nestedFolders.push(...parseFolder(nestedDt))
    }
  }

  return [folder, ...nestedFolders]
}

function parseDL(dl: Element): ImportFolder[] {
  const folders: ImportFolder[] = []
  const looseLinks: BookmarkLink[] = []

  for (const dt of Array.from(dl.children)) {
    if (dt.tagName !== 'DT') continue
    if (directChild(dt, 'H3')) {
      folders.push(...parseFolder(dt))
      continue
    }
    const anchor = directChild<HTMLAnchorElement>(dt, 'A')
    if (!anchor) continue
    const bookmark = bookmarkFromAnchor(anchor)
    if (bookmark) looseLinks.push(bookmark)
  }

  if (looseLinks.length) {
    folders.unshift({ name: '未分类', bookmarks: uniqueLinks(looseLinks) })
  }
  return folders.filter(folder => folder.bookmarks.length > 0)
}

async function processImportFile(file: File) {
  if (!/\.(html?|htm)$/i.test(file.name)) {
    notify('请选择浏览器导出的 HTML 书签文件', 'warning')
    return
  }

  try {
    const text = await file.text()
    const doc = new DOMParser().parseFromString(text, 'text/html')
    const rootDL = doc.querySelector('dl')
    if (!rootDL) {
      notify('这个文件里没有找到书签数据', 'warning')
      return
    }

    const folders = parseDL(rootDL)
    if (folders.length === 0) {
      notify('没有找到可导入的网站', 'warning')
      return
    }
    pendingFileName.value = file.name
    importFolders.value = folders
  } catch {
    notify('书签文件解析失败，请重新导出后再试', 'error')
  }
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await processImportFile(file)
  input.value = ''
}

function onDragEnter() {
  dragDepth++
  dragActive.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragActive.value = false
}

async function onDrop(event: DragEvent) {
  dragDepth = 0
  dragActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) await processImportFile(file)
}

function cancelImport() {
  importFolders.value = []
  pendingFileName.value = ''
}

function folderPreview(folder: ImportFolder) {
  const names = folder.bookmarks.slice(0, 3).map(bookmark => bookmark.title)
  return `${names.join('、')}${folder.bookmarks.length > 3 ? '…' : ''}`
}

async function canReplaceImported() {
  if (sites.value.length === 0) return true
  try {
    return await askConfirm(
      '重新导入会替换这张卡片里现有的书签，自建收藏夹不会受到影响。',
      '替换导入内容？',
      {
        confirmText: '替换并导入',
        cancelText: '保留当前',
        danger: true,
      },
    )
  } catch {
    return false
  }
}

async function applyImport(bookmarks: BookmarkLink[], folderName: string) {
  const unique = uniqueLinks(bookmarks)
  await clearSites(wid.value, 'imported')
  await addSiteItems(unique, wid.value, 'imported')

  const meta: ImportMeta = {
    folder: folderName,
    fileName: pendingFileName.value,
    importedAt: new Date().toISOString(),
  }
  importMeta.value = meta
  localStorage.setItem(importMetaKey, JSON.stringify(meta))
  importFolders.value = []
  pendingFileName.value = ''
  await loadSites()
  notify(`已导入 ${unique.length} 个网站`, 'success')
}

async function importFolder(index: number) {
  const folder = importFolders.value[index]
  if (!folder || !(await canReplaceImported())) return
  await applyImport(folder.bookmarks, folder.name)
}

async function importAll() {
  if (!(await canReplaceImported())) return
  const bookmarks = importFolders.value.flatMap(folder => folder.bookmarks)
  await applyImport(bookmarks, '全部书签')
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showAdd.value) closeAddPanel()
}

onMounted(async () => {
  await loadSites()
  loaded.value = true
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('resize', updateViewport)
})

onBeforeUnmount(() => {
  stopResize()
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('resize', updateViewport)
})

// Dragging
const posKey = `bookmarks-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 100, 100, true)
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const maxColsAllowed = computed(() => {
  const available = viewportWidth.value - 16 - BODY_PAD_X * 2 + GRID_GAP
  return Math.max(MIN_COLS, Math.min(
    MAX_COLS,
    Math.floor(available / (CELL_WIDTH + GRID_GAP)),
  ))
})
const maxRowsAllowed = computed(() => {
  const available = viewportHeight.value - 16 - HEADER_HEIGHT - BODY_PAD_Y + GRID_GAP
  return Math.max(MIN_ROWS, Math.min(
    MAX_ROWS,
    Math.floor(available / (CELL_HEIGHT + GRID_GAP)),
  ))
})
const cardNaturalWidth = computed(() => {
  return BODY_PAD_X * 2
    + cardSize.value.cols * CELL_WIDTH
    + (cardSize.value.cols - 1) * GRID_GAP
})
const cardWidth = computed(() => {
  return Math.min(cardNaturalWidth.value, viewportWidth.value - 16)
})
const gridHeight = computed(() => {
  return cardSize.value.rows * CELL_HEIGHT
    + (cardSize.value.rows - 1) * GRID_GAP
})
const cardNaturalHeight = computed(() => {
  const summaryHeight = isImport.value
    && sites.value.length > 0
    && importFolders.value.length === 0
    && !showAdd.value
    ? IMPORT_SUMMARY_HEIGHT
    : 0
  return HEADER_HEIGHT + BODY_PAD_Y + gridHeight.value + summaryHeight
})
const visibleX = computed(() => {
  const maxX = Math.max(8, viewportWidth.value - cardWidth.value - 8)
  return Math.min(Math.max(8, x.value), maxX)
})
const visibleY = computed(() => {
  const maxY = Math.max(8, viewportHeight.value - cardNaturalHeight.value - 8)
  return Math.min(Math.max(8, y.value), maxY)
})

function updateViewport() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

function beginDrag(event: MouseEvent) {
  if (x.value !== visibleX.value) x.value = visibleX.value
  if (y.value !== visibleY.value) y.value = visibleY.value
  onDragStart(event)
}

// Resize interaction
const resizing = ref<ResizeAxis | null>(null)
let resizeState: {
  axis: ResizeAxis
  startX: number
  startY: number
  cols: number
  rows: number
} | null = null

function clampCardSize(cols: number, rows: number): CardSize {
  return {
    cols: Math.min(maxColsAllowed.value, Math.max(MIN_COLS, Math.round(cols))),
    rows: Math.min(maxRowsAllowed.value, Math.max(MIN_ROWS, Math.round(rows))),
  }
}

function startResize(event: PointerEvent, axis: ResizeAxis) {
  if (showAdd.value) return
  event.preventDefault()
  event.stopPropagation()
  resizeState = {
    axis,
    startX: event.clientX,
    startY: event.clientY,
    cols: cardSize.value.cols,
    rows: cardSize.value.rows,
  }
  resizing.value = axis
  window.addEventListener('pointermove', onResizeMove, { passive: false })
  window.addEventListener('pointerup', stopResize, { once: true })
  window.addEventListener('pointercancel', stopResize, { once: true })
}

function onResizeMove(event: PointerEvent) {
  if (!resizeState) return
  event.preventDefault()
  const colDelta = (event.clientX - resizeState.startX) / (CELL_WIDTH + GRID_GAP)
  const rowDelta = (event.clientY - resizeState.startY) / (CELL_HEIGHT + GRID_GAP)
  const nextCols = resizeState.axis === 'height'
    ? resizeState.cols
    : resizeState.cols + Math.round(colDelta)
  const nextRows = resizeState.axis === 'width'
    ? resizeState.rows
    : resizeState.rows + Math.round(rowDelta)
  const clamped = clampCardSize(nextCols, nextRows)
  if (clamped.cols !== cardSize.value.cols || clamped.rows !== cardSize.value.rows) {
    cardSize.value = clamped
  }
}

function stopResize() {
  resizeState = null
  resizing.value = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', stopResize)
  window.removeEventListener('pointercancel', stopResize)
}

function nudgeSize(event: KeyboardEvent, axis: ResizeAxis) {
  const widthStep = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  const heightStep = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  const widthAllowed = axis !== 'height' && widthStep !== 0
  const heightAllowed = axis !== 'width' && heightStep !== 0
  if (!widthAllowed && !heightAllowed) return

  event.preventDefault()
  event.stopPropagation()
  cardSize.value = clampCardSize(
    cardSize.value.cols + (widthAllowed ? widthStep : 0),
    cardSize.value.rows + (heightAllowed ? heightStep : 0),
  )
}
</script>

<template>
  <div
    class="bookmarks widget-card"
    :class="[
      `bm-cols-${cardSize.cols === 1 ? 'one' : 'many'}`,
      {
        'bm-is-import': isImport,
        'bm-editing': showAdd,
        'bm-resizing': resizing != null,
      },
    ]"
    :style="{
      left: visibleX + 'px',
      top: visibleY + 'px',
      width: cardWidth + 'px',
      height: cardNaturalHeight + 'px',
    }"
  >
    <DragBar variant="overlay" :on-drag-start="beginDrag" />

    <div v-if="!loaded" class="bm-loading">
      <span class="bm-loading-line" />
      <span class="bm-loading-line short" />
    </div>

    <template v-else-if="!isImport">
      <div v-if="sites.length === 0" class="bm-empty">
        <div class="bm-empty-art" aria-hidden="true">
          <span />
          <span />
          <span class="bm-empty-plus">＋</span>
        </div>
        <div class="bm-empty-copy">
          <span class="bm-eyebrow">自建快捷导航</span>
          <h3>从第一张卡片开始</h3>
          <p>添加你每天都会打开的网站，图标会自动获取。</p>
        </div>
        <button type="button" class="bm-primary-btn" @click="openAddPanel">
          ＋ 添加网站
        </button>
      </div>

      <div v-else class="bm-body">
        <div
          class="bm-grid"
          :style="{
            gridTemplateColumns: `repeat(${cardSize.cols}, minmax(0, 1fr))`,
            gridAutoRows: CELL_HEIGHT + 'px',
          }"
        >
          <div
            v-for="slot in displaySlots"
            :key="slot?.id ?? 'add'"
            class="bm-site-wrap"
          >
            <template v-if="slot">
              <a
                :href="slot.url"
                target="_blank"
                rel="noreferrer"
                class="bm-site"
                :title="slot.title"
                @click.stop
              >
                <span class="bm-icon-shell">
                  <FaviconImg
                    :url="slot.url"
                    :fallback-text="siteInitial(slot.title)"
                    :fallback-color="initialColor(slot.title)"
                    :size="iconSize"
                  />
                </span>
                <span class="bm-site-copy">
                  <span class="bm-site-name">{{ slot.title }}</span>
                  <span v-if="cardSize.cols === 1" class="bm-site-domain">
                    {{ siteDomain(slot.url) }}
                  </span>
                </span>
              </a>
              <button
                type="button"
                class="bm-delete"
                :aria-label="`删除 ${slot.title}`"
                title="删除网站"
                @click.stop="removeSite(slot.id)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.25 4.25 11.75 11.75M11.75 4.25 4.25 11.75" />
                </svg>
              </button>
            </template>

            <button
              v-else
              type="button"
              class="bm-add-cell"
              aria-label="添加网站"
              @click="openAddPanel"
            >
              <span class="bm-add-symbol" aria-hidden="true">＋</span>
              <span class="bm-add-label">添加</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div
        v-if="sites.length === 0 && importFolders.length === 0"
        class="bm-import-empty"
        :class="{ 'drag-active': dragActive }"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div class="bm-import-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M13 8.5h15.5a4 4 0 0 1 4 4v28L24 34l-8.5 6.5v-28a4 4 0 0 1 4-4Z" />
            <path d="M20 19h12M20 24h8" />
            <path d="M35 13h1a4 4 0 0 1 4 4v23l-6-4.2" />
          </svg>
        </div>
        <div class="bm-empty-copy">
          <span class="bm-eyebrow">浏览器书签</span>
          <h3>把书签搬到这里</h3>
          <p>从浏览器导出一个 HTML 文件，再选择要保留的分组。</p>
        </div>
        <button type="button" class="bm-primary-btn" @click="triggerImport">
          选择书签文件
        </button>
        <span class="bm-drop-hint">也可以直接把 HTML 文件拖进来</span>
      </div>

      <div v-else-if="importFolders.length > 0" class="bm-import-picker">
        <div class="bm-picker-head">
          <div>
            <span class="bm-eyebrow">选择导入范围</span>
            <h3>要放进哪个分组？</h3>
          </div>
          <button type="button" class="bm-text-btn" @click="cancelImport">
            换文件
          </button>
        </div>

        <div class="bm-folder-list" role="list">
          <button
            v-for="(folder, index) in importFolders"
            :key="`${folder.name}-${index}`"
            type="button"
            class="bm-folder"
            role="listitem"
            @click="importFolder(index)"
          >
            <span class="bm-folder-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z" />
              </svg>
            </span>
            <span class="bm-folder-copy">
              <span class="bm-folder-name">{{ folder.name }}</span>
              <span class="bm-folder-preview">{{ folderPreview(folder) }}</span>
            </span>
            <span class="bm-folder-count">{{ folder.bookmarks.length }}</span>
          </button>
        </div>

        <button
          v-if="importFolders.length > 1"
          type="button"
          class="bm-import-all"
          @click="importAll"
        >
          导入全部 {{ totalImportCount }} 个网站
        </button>
      </div>

      <template v-else>
        <div class="bm-import-summary">
          <div class="bm-import-copy">
            <span class="bm-eyebrow">已从浏览器导入</span>
            <strong>{{ importMeta?.folder || '书签' }}</strong>
            <span>{{ sites.length }} 个网站</span>
          </div>
          <button type="button" class="bm-text-btn" @click="triggerImport">
            重新导入
          </button>
        </div>

        <div class="bm-body">
          <div
            class="bm-grid"
            :style="{
              gridTemplateColumns: `repeat(${cardSize.cols}, minmax(0, 1fr))`,
              gridAutoRows: CELL_HEIGHT + 'px',
            }"
          >
            <div
              v-for="slot in displaySlots"
              :key="slot!.id"
              class="bm-site-wrap"
            >
              <a
                :href="slot!.url"
                target="_blank"
                rel="noreferrer"
                class="bm-site"
                :title="slot!.title"
                @click.stop
              >
                <span class="bm-icon-shell">
                  <FaviconImg
                    :url="slot!.url"
                    :fallback-text="siteInitial(slot!.title)"
                    :fallback-color="initialColor(slot!.title)"
                    :size="iconSize"
                  />
                </span>
                <span class="bm-site-copy">
                  <span class="bm-site-name">{{ slot!.title }}</span>
                  <span v-if="cardSize.cols === 1" class="bm-site-domain">
                    {{ siteDomain(slot!.url) }}
                  </span>
                </span>
              </a>
              <button
                type="button"
                class="bm-delete"
                :aria-label="`删除 ${slot!.title}`"
                title="删除网站"
                @click.stop="removeSite(slot!.id)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.25 4.25 11.75 11.75M11.75 4.25 4.25 11.75" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>

    <div v-if="!showAdd" class="bm-resize-controls">
      <button
        type="button"
        class="bm-resize-handle bm-resize-right"
        :aria-label="`调整宽度，当前 ${cardSize.cols} 列，使用左右方向键`"
        title="拖动调整宽度"
        @pointerdown="startResize($event, 'width')"
        @keydown="nudgeSize($event, 'width')"
      />
      <button
        type="button"
        class="bm-resize-handle bm-resize-bottom"
        :aria-label="`调整高度，当前 ${cardSize.rows} 行，使用上下方向键`"
        title="拖动调整高度"
        @pointerdown="startResize($event, 'height')"
        @keydown="nudgeSize($event, 'height')"
      />
      <button
        type="button"
        class="bm-resize-handle bm-resize-corner"
        :aria-label="`调整宽高，当前 ${cardSize.cols} 列 ${cardSize.rows} 行，使用方向键`"
        title="拖动调整宽高"
        @pointerdown="startResize($event, 'both')"
        @keydown="nudgeSize($event, 'both')"
      >
        <span aria-hidden="true" />
      </button>
      <Transition name="bm-size-fade">
        <span v-if="resizing" class="bm-resize-readout" aria-live="polite">
          {{ cardSize.cols }} × {{ cardSize.rows }}
        </span>
      </Transition>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".html,.htm,text/html"
      class="bm-file-input"
      aria-label="选择浏览器书签文件"
      @change="onImportFile"
    />

    <Transition name="bm-form">
      <div
        v-if="showAdd"
        class="bm-form-layer"
        @mousedown.self="closeAddPanel"
      >
        <form
          class="bm-form"
          role="dialog"
          :aria-labelledby="formTitleId"
          novalidate
          @submit.prevent="submitAdd(false)"
        >
          <div class="bm-form-head">
            <div>
              <span class="bm-eyebrow">新建站点</span>
              <h3 :id="formTitleId">添加一个常用网站</h3>
            </div>
            <button
              type="button"
              class="bm-icon-btn"
              aria-label="关闭添加表单"
              @click="closeAddPanel"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.25 4.25 11.75 11.75M11.75 4.25 4.25 11.75" />
              </svg>
            </button>
          </div>

          <div class="bm-preview">
            <span class="bm-preview-icon">
              <FaviconImg
                v-if="previewUrl"
                :url="previewUrl"
                :fallback-text="siteInitial(previewTitle)"
                :fallback-color="initialColor(previewTitle)"
                :size="34"
              />
              <span v-else class="bm-preview-placeholder" aria-hidden="true">＋</span>
            </span>
            <span class="bm-preview-copy">
              <strong>{{ previewTitle }}</strong>
              <span>{{ previewDomain || '输入网址后自动识别' }}</span>
            </span>
          </div>

          <label class="bm-field">
            <span class="bm-field-label">网址</span>
            <input
              ref="urlInput"
              v-model="addDraft.url"
              type="text"
              inputmode="url"
              autocomplete="url"
              spellcheck="false"
              placeholder="例如 github.com"
            />
            <span class="bm-field-hint">不用特意写 https://，会自动补全。</span>
          </label>

          <label class="bm-field">
            <span class="bm-field-label">
              显示名称
              <span>可选</span>
            </span>
            <input
              v-model="addDraft.title"
              type="text"
              autocomplete="off"
              placeholder="留空则使用网站域名"
              @keydown.enter.prevent="submitAdd(false)"
            />
          </label>

          <div class="bm-form-actions">
            <button type="button" class="bm-secondary-btn" @click="closeAddPanel">
              取消
            </button>
            <div class="bm-form-actions-right">
              <button
                type="button"
                class="bm-quiet-btn"
                :disabled="saving"
                @click="submitAdd(true)"
              >
                保存并继续
              </button>
              <button type="submit" class="bm-primary-btn compact" :disabled="saving">
                {{ saving ? '保存中…' : '保存站点' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bookmarks {
  position: absolute;
  z-index: 56;
  display: flex;
  flex-direction: column;
  container-type: size;
}

.bookmarks.widget-card {
  background: rgba(255, 255, 255, 0.42);
  border-color: rgba(255, 255, 255, 0.34);
  backdrop-filter: blur(32px) saturate(1.25);
  -webkit-backdrop-filter: blur(32px) saturate(1.25);
  box-shadow: 0 14px 42px rgba(15, 23, 42, 0.06);
}

.bookmarks.widget-card:hover {
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.bookmarks.bm-editing {
  min-height: min(500px, calc(100vh - 52px));
}

.bookmarks.bm-resizing {
  user-select: none;
}

.bookmarks :deep(.drag-bar--overlay) {
  top: 4px;
  left: 50%;
  right: auto;
  width: 42px;
  height: 14px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-ink) 8%, transparent);
  opacity: 0;
  transition: opacity 150ms ease, background 150ms ease;
}

.bookmarks:hover :deep(.drag-bar--overlay),
.bookmarks:focus-within :deep(.drag-bar--overlay) {
  opacity: 0.58;
}

.bookmarks :deep(.drag-bar--overlay:hover) {
  background: color-mix(in srgb, var(--color-ink) 13%, transparent);
  opacity: 0.88;
}

.bookmarks :deep(.drag-bar__dots) {
  font-size: 9px;
  letter-spacing: 2px;
  line-height: 1;
}

.bm-resize-controls {
  position: absolute;
  z-index: 8;
  inset: 0;
  pointer-events: none;
}

.bm-resize-handle {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink-3);
  pointer-events: auto;
  touch-action: none;
}

.bm-resize-handle::before {
  content: "";
  position: absolute;
  background: color-mix(in srgb, var(--color-primary) 58%, transparent);
  opacity: 0;
  transition: opacity 140ms ease;
}

.bm-resize-handle:hover::before,
.bm-resize-handle:focus-visible::before,
.bm-resizing .bm-resize-handle::before {
  opacity: 1;
}

.bm-resize-right {
  top: 0;
  right: 0;
  bottom: 8px;
  width: 7px;
  cursor: ew-resize;
}

.bm-resize-right::before {
  top: 12px;
  right: 2px;
  bottom: 12px;
  width: 1px;
}

.bm-resize-bottom {
  right: 8px;
  bottom: 0;
  left: 0;
  height: 7px;
  cursor: ns-resize;
}

.bm-resize-bottom::before {
  right: 12px;
  bottom: 2px;
  left: 12px;
  height: 1px;
}

.bm-resize-corner {
  right: 7px;
  bottom: 7px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  cursor: nwse-resize;
  border-radius: 6px;
}

.bm-resize-corner span {
  width: 8px;
  height: 8px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  opacity: 0;
  transition: opacity 140ms ease, color 140ms ease;
}

.bookmarks:hover .bm-resize-corner span {
  opacity: 0.3;
}

.bm-resize-corner:hover span,
.bm-resize-corner:focus-visible span,
.bm-resizing .bm-resize-corner span {
  color: var(--color-primary);
  opacity: 1;
}

.bm-resizing .bm-resize-corner {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.bm-resize-readout {
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 14px;
  padding: 3px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface) 86%, transparent);
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: 0.56rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.bm-size-fade-enter-active,
.bm-size-fade-leave-active {
  transition: opacity 140ms ease;
}

.bm-size-fade-enter-from,
.bm-size-fade-leave-to {
  opacity: 0;
}

.bm-body {
  flex: 1;
  min-height: 0;
  padding: 14px 12px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.bm-grid {
  display: grid;
  gap: 10px;
}

.bm-site-wrap {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.bm-site {
  width: 100%;
  height: 100%;
  min-height: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 6px 8px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: var(--color-ink);
  text-decoration: none;
  box-shadow: none;
  overflow: hidden;
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .bm-site:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--color-primary) 26%, var(--color-border));
    background: var(--color-surface);
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  }
}

.bm-site:active {
  transform: translateY(0) scale(0.99);
}

.bm-site:focus-visible,
.bm-add-cell:focus-visible,
.bm-folder:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.bm-icon-shell {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 16px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.44)),
    var(--color-bg);
  border: 1px solid color-mix(in srgb, var(--color-border) 64%, transparent);
  box-shadow:
    0 5px 14px rgba(15, 23, 42, 0.07),
    0 1px 0 rgba(255, 255, 255, 0.8) inset;
}

.bm-site-copy {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  overflow: hidden;
}

.bm-site-name {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  color: var(--color-ink);
  font-size: 0.73rem;
  font-weight: 650;
  line-height: 1.3;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-site-domain {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  color: var(--color-ink-3);
  font-size: 0.58rem;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-delete {
  position: absolute;
  z-index: 2;
  top: 5px;
  right: 5px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-ink) 64%, transparent);
  color: #fff;
  cursor: pointer;
  opacity: 0.64;
  transition: opacity 150ms ease, background 150ms ease;
}

.bm-delete svg,
.bm-icon-btn svg {
  width: 9px;
  height: 9px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

@media (hover: hover) and (pointer: fine) {
  .bm-delete {
    opacity: 0;
  }

  .bm-site-wrap:hover .bm-delete,
  .bm-delete:focus-visible {
    opacity: 1;
  }
}

.bm-delete:hover {
  background: var(--color-danger);
  opacity: 1;
}

.bm-add-cell {
  width: 100%;
  height: 100%;
  min-height: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px;
  border: 1.5px dashed transparent;
  border-radius: 14px;
  background: transparent;
  color: color-mix(in srgb, var(--color-ink-3) 55%, transparent);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.63rem;
  font-weight: 600;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.bm-add-symbol {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: transparent;
  font-size: 19px;
  font-weight: 300;
  opacity: 0.52;
  transition: opacity 150ms ease, background 150ms ease;
}

.bm-add-label {
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 150ms ease, transform 150ms ease;
}

.bm-add-cell:hover {
  color: color-mix(in srgb, var(--color-primary) 72%, var(--color-ink));
  border-color: color-mix(in srgb, var(--color-primary) 60%, transparent);
  background: var(--color-primary-soft);
}

.bm-add-cell:hover .bm-add-symbol {
  background: color-mix(in srgb, var(--color-ink) 5%, transparent);
  opacity: 1;
}

.bm-add-cell:hover .bm-add-label,
.bm-add-cell:focus-visible .bm-add-label {
  opacity: 0.82;
  transform: translateY(0);
}

.bm-empty,
.bm-import-empty {
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 17px;
  padding: 26px 24px 24px;
  text-align: center;
}

.bm-empty {
  flex: 1;
  overflow-y: auto;
}

.bm-empty-art {
  position: relative;
  width: 94px;
  height: 64px;
}

.bm-empty-art > span {
  position: absolute;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent);
  background: var(--color-surface);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
}

.bm-empty-art > span:nth-child(1) {
  left: 4px;
  top: 10px;
  transform: rotate(-8deg);
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
}

.bm-empty-art > span:nth-child(2) {
  right: 4px;
  top: 8px;
  transform: rotate(8deg);
}

.bm-empty-art > .bm-empty-plus {
  left: 50%;
  top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateX(-50%);
  color: color-mix(in srgb, var(--color-primary) 72%, var(--color-ink));
  font-size: 24px;
  font-weight: 300;
}

.bm-empty-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.bm-empty-copy h3,
.bm-picker-head h3,
.bm-form-head h3 {
  color: var(--color-ink);
  font-size: 0.98rem;
  line-height: 1.3;
  letter-spacing: -0.015em;
}

.bm-empty-copy p {
  max-width: 240px;
  color: var(--color-ink-2);
  font-size: 0.72rem;
  line-height: 1.6;
  text-wrap: pretty;
}

.bm-eyebrow {
  color: var(--color-ink-3);
  font-size: 0.56rem;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.bm-primary-btn,
.bm-secondary-btn,
.bm-quiet-btn,
.bm-text-btn {
  border: 0;
  cursor: pointer;
  font-family: inherit;
  transition: background 160ms ease, color 160ms ease, opacity 160ms ease;
}

.bm-primary-btn {
  min-height: 38px;
  padding: 0 17px;
  border-radius: 10px;
  background: var(--color-primary);
  color: #12382f;
  font-size: 0.75rem;
  font-weight: 750;
  white-space: nowrap;
  box-shadow: 0 5px 14px rgba(45, 212, 168, 0.22);
}

.bm-primary-btn.compact {
  min-height: 36px;
  padding: 0 14px;
}

.bm-primary-btn:hover {
  background: var(--color-primary-hover);
}

.bm-primary-btn:disabled,
.bm-quiet-btn:disabled {
  cursor: wait;
  opacity: 0.56;
}

.bm-text-btn {
  padding: 5px 0;
  background: transparent;
  color: color-mix(in srgb, var(--color-primary) 64%, var(--color-ink));
  font-size: 0.67rem;
  font-weight: 700;
}

.bm-text-btn:hover {
  color: var(--color-primary-hover);
}

.bm-import-empty {
  min-height: 0;
  flex: 1;
  border: 1.5px dashed var(--color-border);
  border-radius: 14px;
  margin: 13px;
  transition: border-color 160ms ease, background 160ms ease;
}

.bm-import-empty.drag-active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.bm-import-mark {
  width: 62px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 19px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: color-mix(in srgb, var(--color-primary) 68%, var(--color-ink));
}

.bm-import-mark svg {
  width: 38px;
  height: 38px;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bm-drop-hint {
  color: var(--color-ink-3);
  font-size: 0.62rem;
}

.bm-import-picker {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 14px 13px;
}

.bm-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.bm-picker-head > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bm-folder-list {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0;
  overflow-y: auto;
}

.bm-folder {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 150ms ease;
}

.bm-folder:hover {
  background: color-mix(in srgb, var(--color-ink) 5%, transparent);
}

.bm-folder-glyph {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-ink) 5%, transparent);
  color: var(--color-ink-2);
}

.bm-folder-glyph svg {
  width: 19px;
  height: 19px;
  stroke: currentColor;
  stroke-width: 1.55;
}

.bm-folder-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bm-folder-name {
  overflow: hidden;
  color: var(--color-ink);
  font-size: 0.73rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-folder-preview {
  overflow: hidden;
  color: var(--color-ink-3);
  font-size: 0.6rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-folder-count {
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-ink) 6%, transparent);
  color: var(--color-ink-3);
  font-size: 0.58rem;
  text-align: center;
}

.bm-import-all {
  width: 100%;
  min-height: 37px;
  flex-shrink: 0;
  border: 0;
  border-radius: 10px;
  background: var(--color-primary-soft);
  color: color-mix(in srgb, var(--color-primary) 58%, var(--color-ink));
  cursor: pointer;
  font-family: inherit;
  font-size: 0.69rem;
  font-weight: 700;
  transition: background 160ms ease;
}

.bm-import-all:hover {
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.bm-import-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 14px 0;
  padding: 9px 11px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--color-ink) 4%, transparent);
}

.bm-import-copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
}

.bm-import-copy strong {
  overflow: hidden;
  color: var(--color-ink);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-import-copy > span:last-child {
  flex-shrink: 0;
  color: var(--color-ink-3);
  font-size: 0.58rem;
}

.bm-import-copy .bm-eyebrow {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.bm-file-input {
  display: none;
}

.bm-loading {
  min-height: 172px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
}

.bm-loading-line {
  width: 110px;
  height: 9px;
  border-radius: 999px;
  background: var(--color-surface-soft);
}

.bm-loading-line.short {
  width: 72px;
}

.bm-form-layer {
  position: absolute;
  z-index: 10;
  inset: 0;
  display: flex;
  align-items: stretch;
  padding: 10px;
  border-radius: inherit;
  background: color-mix(in srgb, var(--color-bg) 68%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.bm-form {
  width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 18px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow: 0 22px 56px rgba(15, 23, 42, 0.2);
}

.bm-form-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.bm-form-head > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bm-form-head h3 {
  font-size: 1rem;
}

.bm-icon-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-ink) 6%, transparent);
  color: var(--color-ink-2);
  cursor: pointer;
  display: grid;
  place-items: center;
}

.bm-icon-btn svg {
  width: 11px;
  height: 11px;
}

.bm-icon-btn:hover {
  background: color-mix(in srgb, var(--color-ink) 10%, transparent);
  color: var(--color-ink);
}

.bm-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg));
}

.bm-preview-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 13px;
  background: var(--color-surface);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.07);
}

.bm-preview-placeholder {
  color: var(--color-ink-3);
  font-size: 21px;
  font-weight: 300;
}

.bm-preview-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bm-preview-copy strong {
  overflow: hidden;
  color: var(--color-ink);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-preview-copy span {
  overflow: hidden;
  color: var(--color-ink-3);
  font-size: 0.62rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.bm-field-label {
  display: flex;
  align-items: baseline;
  gap: 5px;
  color: var(--color-ink-2);
  font-size: 0.68rem;
  font-weight: 650;
}

.bm-field-label span {
  color: var(--color-ink-3);
  font-size: 0.58rem;
  font-weight: 500;
}

.bm-field input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: inherit;
  font-size: 0.78rem;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.bm-field input::placeholder {
  color: var(--color-ink-3);
}

.bm-field input:focus {
  border-color: color-mix(in srgb, var(--color-primary) 76%, var(--color-border));
  background: var(--color-surface);
  box-shadow: var(--focus-ring);
}

.bm-field-hint {
  color: var(--color-ink-3);
  font-size: 0.6rem;
  line-height: 1.45;
}

.bm-form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.bm-form-actions-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bm-secondary-btn {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-ink) 6%, transparent);
  color: var(--color-ink-2);
  font-size: 0.69rem;
  font-weight: 650;
}

.bm-secondary-btn:hover {
  background: color-mix(in srgb, var(--color-ink) 10%, transparent);
  color: var(--color-ink);
}

.bm-quiet-btn {
  min-height: 36px;
  padding: 0 6px;
  background: transparent;
  color: var(--color-ink-2);
  font-size: 0.65rem;
  font-weight: 650;
}

.bm-quiet-btn:hover {
  color: var(--color-ink);
}

.bm-form-enter-active,
.bm-form-leave-active {
  transition: opacity 180ms ease;
}

.bm-form-enter-active .bm-form,
.bm-form-leave-active .bm-form {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.bm-form-enter-from,
.bm-form-leave-to {
  opacity: 0;
}

.bm-form-enter-from .bm-form,
.bm-form-leave-to .bm-form {
  transform: translateY(10px) scale(0.99);
}

html.dark .bm-icon-shell {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.02)),
    var(--color-bg);
  box-shadow:
    0 5px 14px rgba(0, 0, 0, 0.3),
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

html.dark .bookmarks.widget-card {
  background: rgba(30, 34, 40, 0.58);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 14px 42px rgba(0, 0, 0, 0.34);
}

html.dark .bookmarks.widget-card:hover {
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
}

html.dark .bm-site {
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset;
}

html.dark .bm-form {
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

@container (max-width: 318px) {
  .bm-kind {
    display: none;
  }
}

@container (max-height: 310px) {
  .bm-empty,
  .bm-import-empty {
    gap: 10px;
    padding: 14px 18px;
  }

  .bm-import-empty {
    margin: 10px;
  }

  .bm-empty-art {
    width: 76px;
    height: 52px;
  }

  .bm-empty-art > span {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }

  .bm-import-mark {
    width: 48px;
    height: 48px;
    border-radius: 15px;
  }

  .bm-import-mark svg {
    width: 30px;
    height: 30px;
  }

  .bm-empty-copy p {
    line-height: 1.45;
  }

  .bm-drop-hint {
    display: none;
  }
}

@container (max-height: 220px) {
  .bm-empty,
  .bm-import-empty {
    gap: 8px;
    padding: 9px 12px;
  }

  .bm-import-empty {
    margin: 8px;
  }

  .bm-empty-art,
  .bm-import-mark,
  .bm-empty-copy .bm-eyebrow,
  .bm-empty-copy p {
    display: none;
  }

  .bm-empty-copy h3 {
    font-size: 0.82rem;
  }

  .bm-primary-btn {
    min-height: 34px;
    padding-inline: 9px;
    font-size: 0.68rem;
  }
}

@supports not (color: color-mix(in srgb, white, black)) {
  .bm-site,
  .bm-form,
  .bm-site-wrap {
    border-color: var(--color-border);
  }
}
</style>
