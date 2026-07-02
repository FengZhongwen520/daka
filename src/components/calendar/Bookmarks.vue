<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSites, addSiteItem, removeSiteItem, clearSites } from '../../db'

interface Site { id?: number; url: string; title: string }

const sites = ref<Site[]>([])

onMounted(async () => { sites.value = await getSites() })

// Title
const saved = JSON.parse(localStorage.getItem('bm-title') || 'null')
const title = ref(saved ?? '收藏夹')
watch(title, (v) => localStorage.setItem('bm-title', JSON.stringify(v)))

// Layout
const savedLayout = localStorage.getItem('bm-layout') || '3x3'
const layouts = ['3x3', '4x4', '2x4', '4x2'] as const
type Layout = (typeof layouts)[number]
const currentLayout = ref<Layout>(savedLayout as Layout)
watch(currentLayout, (v) => localStorage.setItem('bm-layout', v))

const cols = computed(() => parseInt(currentLayout.value[0]))
const rows = computed(() => parseInt(currentLayout.value[2]))

// Max body height = visible rows × (cell + gap) + padding
const bodyMaxH = computed(() => {
  const w = { '3x3': 210, '4x4': 280, '2x4': 150, '4x2': 240 }[currentLayout.value] || 210
  const cellW = (w - 20 - (cols.value - 1) * 6) / cols.value
  return rows.value * cellW + (rows.value - 1) * 6 + 20
})

const displaySlots = computed(() => {
  // Show all sites + one empty "+" slot at the end
  const slots: (Site | null)[] = [...sites.value]
  slots.push(null) // add button
  return slots
})

// Add dialog
const showAdd = ref(false)
const addUrl = ref('')
const addTitle = ref('')
async function submitAdd() {
  const url = addUrl.value.trim()
  if (!url) { ElMessage.warning('请输入网址'); return }
  let fixed = url
  if (!/^https?:\/\//.test(fixed)) fixed = 'https://' + fixed
  await addSiteItem(fixed, addTitle.value.trim() || fixed)
  sites.value = await getSites()
  showAdd.value = false
  ElMessage.success('已添加')
}
async function removeSite(id: number) { await removeSiteItem(id); sites.value = await getSites() }

// Favicon
function faviconUrl(url: string) {
  try { return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url.startsWith('http')?url:'https://'+url)}&size=48` } catch { return '' }
}
function siteInitial(t: string) { return (t || '?').charAt(0).toUpperCase() }
function initialColor(t: string) {
  const colors = ['#ff6b6b','#2DD4A8','#3B82F6','#F59E0B','#8B5CF6','#EC4899','#06B6D4']
  let hash = 0; for (let i = 0; i < t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}
function onImgError(e: Event) {
  const img = e.target as HTMLImageElement; img.style.display = 'none'
  const el = img.parentElement?.querySelector('.bm-initial') as HTMLElement
  if (el) el.style.display = 'flex'
}

// Title edit
const editingTitle = ref(false)
const titleInput = ref<HTMLInputElement>()
function startEditTitle() { editingTitle.value = true; setTimeout(() => titleInput.value?.focus(), 50) }
function saveTitle() { editingTitle.value = false; if (!title.value.trim()) title.value = '收藏夹' }

// Import
const importMode = ref(false)
const importFolders = ref<{ name: string; bookmarks: { url: string; title: string }[] }[]>([])
const fileInput = ref<HTMLInputElement>()

function triggerImport() { fileInput.value?.click() }

// Recursively parse DL, returns flat list of all folders (including nested)
function parseDL(dl: Element): { name: string; bookmarks: { url: string; title: string }[] }[] {
  const result: { name: string; bookmarks: { url: string; title: string }[] }[] = []
  const children = Array.from(dl.children)
  let currentFolder: { name: string; bookmarks: { url: string; title: string }[] } | null = null

  for (const child of children) {
    if (child.tagName !== 'DT') continue
    const h3 = child.querySelector('h3')
    const subDL = child.querySelector('dl')
    const links = child.querySelectorAll('a[href]')

    if (h3) {
      const folderName = h3.textContent?.trim() || '未命名'
      currentFolder = { name: folderName, bookmarks: [] }

      // Links directly in this folder
      links.forEach(a => {
        const url = a.getAttribute('href')?.trim() || ''
        const t = a.textContent?.trim() || url
        if (url.startsWith('http')) currentFolder!.bookmarks.push({ url, title: t })
      })

      // Sub-folders: parse recursively and add as separate entries
      if (subDL) {
        const subs = parseDL(subDL)
        for (const sf of subs) {
          result.push(sf)  // sub-folder as independent entry
        }
      }

      // Push current folder even if empty (may have sub-folders)
      result.push(currentFolder)
    } else if (links.length > 0 && currentFolder) {
      const folder = currentFolder
      links.forEach(a => {
        const url = a.getAttribute('href')?.trim() || ''
        const t = a.textContent?.trim() || url
        if (url.startsWith('http')) folder.bookmarks.push({ url, title: t })
      })
    }
  }

  return result.filter(f => f.bookmarks.length > 0)
}

async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const rootDL = doc.querySelector('dl')
    if (!rootDL) { ElMessage.warning('未找到书签数据'); return }
    importFolders.value = parseDL(rootDL)
    if (importFolders.value.length === 0) { ElMessage.warning('未找到任何网址'); return }
    importMode.value = true
  } catch { ElMessage.error('解析失败') }
}

async function importFolder(index: number) {
  const folder = importFolders.value[index]
  await clearSites()
  for (const b of folder.bookmarks) await addSiteItem(b.url, b.title)
  sites.value = await getSites()
  importMode.value = false
  ElMessage.success(`「${folder.name}」导入 ${folder.bookmarks.length} 个网址`)
}

async function importAll() {
  await clearSites()
  let count = 0
  for (const f of importFolders.value) {
    for (const b of f.bookmarks) { await addSiteItem(b.url, b.title); count++ }
  }
  sites.value = await getSites()
  importMode.value = false
  ElMessage.success(`全部导入 ${count} 个网址`)
}

function cancelImport() { importMode.value = false }

// Drag
const props = defineProps<{ widgetId?: number }>()
const posKey = `bookmarks-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? 100); const y = ref(savedPos?.y ?? 100)
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
  <div class="bookmarks" :class="`layout-${currentLayout}`" :style="{ left: x + 'px', top: y + 'px' }">
    <div class="bm-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
      <input v-if="editingTitle" ref="titleInput" v-model="title" class="bm-title-input" @blur="saveTitle" @keyup.enter="saveTitle" @mousedown.stop />
      <span v-else class="bm-label" @dblclick="startEditTitle">{{ title }}</span>
      <template v-if="!importMode">
        <div class="bm-layouts">
          <button v-for="l in layouts" :key="l" class="bm-layout-btn" :class="{ active: currentLayout === l }" @mousedown.stop @click="currentLayout = l">{{ l }}</button>
        </div>
        <button class="bm-import-btn" @mousedown.stop @click="triggerImport" title="导入浏览器收藏夹">📥</button>
      </template>
    </div>

    <!-- Normal grid -->
    <div v-if="!importMode" class="bm-body bm-grid" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxHeight: bodyMaxH + 'px' }">
      <div v-for="(slot, i) in displaySlots" :key="i" class="bm-cell" :class="{ empty: !slot }">
        <template v-if="slot">
          <a :href="slot.url" target="_blank" class="bm-link" @click.stop :title="slot.title">
            <img :src="faviconUrl(slot.url)" class="bm-favicon" @error="onImgError" />
            <span class="bm-initial" :style="{ background: initialColor(slot.title), display: 'none' }">{{ siteInitial(slot.title) }}</span>
            <span class="bm-site-name">{{ slot.title }}</span>
          </a>
          <button class="bm-del-btn" @click.stop="removeSite(slot.id!)">✕</button>
        </template>
        <button v-else class="bm-add-btn" @click="showAdd = true; addUrl = ''; addTitle = ''">+</button>
      </div>
    </div>

    <!-- Import folder list (in body) -->
    <div v-else class="bm-body bm-import-body">
      <div class="bm-import-header">
        <span>📂 选择要导入的目录</span>
        <button class="bm-import-cancel" @click="cancelImport">✕</button>
      </div>
      <div class="bm-import-list">
        <div v-for="(f, i) in importFolders" :key="i" class="bm-import-item" @click="importFolder(i)">
          <span class="bm-folder-icon">📂</span>
          <div class="bm-folder-info">
            <span class="bm-folder-name">{{ f.name }}</span>
            <span class="bm-folder-preview">{{ f.bookmarks.slice(0, 3).map(b => b.title).join('、') }}{{ f.bookmarks.length > 3 ? '...' : '' }}</span>
          </div>
          <span class="bm-folder-count">{{ f.bookmarks.length }}</span>
        </div>
      </div>
      <div v-if="importFolders.length > 1" class="bm-import-all" @click="importAll">
        导入全部 {{ importFolders.reduce((s, f) => s + f.bookmarks.length, 0) }} 个网址
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".html,.htm" style="display:none" @change="onImportFile" />

    <el-dialog v-model="showAdd" title="添加网站" width="340px" :close-on-click-modal="false">
      <el-form label-position="top" @submit.prevent="submitAdd">
        <el-form-item label="网址"><el-input v-model="addUrl" placeholder="https://example.com" @keyup.enter="submitAdd" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="addTitle" placeholder="网站名称（可选）" @keyup.enter="submitAdd" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="submitAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bookmarks {
  position: absolute;
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(20px) saturate(1.5);
  border-radius: 14px; border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  z-index: 56; display: flex; flex-direction: column;
}
.layout-3x3 { width: 210px; }
.layout-4x4 { width: 280px; }
.layout-2x4 { width: 150px; }
.layout-4x2 { width: 240px; }

.bm-drag-bar {
  height: 24px; background: rgba(255,255,255,0.4);
  display: flex; align-items: center; gap: 4px;
  padding: 0 8px; cursor: grab; user-select: none;
  flex-shrink: 0; border-bottom: 1px solid rgba(0,0,0,0.06);
}
.bm-drag-bar:active { cursor: grabbing; }
.drag-dots { color: rgba(0,0,0,0.25); font-size: 12px; letter-spacing: 2px; }
.bm-label { font-size: 0.7rem; font-weight: 700; color: rgba(0,0,0,0.5); cursor: pointer; }
.bm-label:hover { color: rgba(0,0,0,0.7); }
.bm-title-input { width: 100px; font-size: 0.7rem; font-weight: 700; border: 1.5px solid #2DD4A8; border-radius: 4px; padding: 1px 4px; outline: none; font-family: inherit; background: rgba(255,255,255,0.9); }
.bm-layouts { margin-left: auto; display: flex; gap: 1px; }
.bm-layout-btn { padding: 1px 5px; border-radius: 3px; border: none; background: rgba(0,0,0,0.05); cursor: pointer; font-size: 0.55rem; font-weight: 700; color: rgba(0,0,0,0.35); transition: all 0.15s; font-family: inherit; }
.bm-layout-btn:hover { background: rgba(0,0,0,0.1); }
.bm-layout-btn.active { background: rgba(45,212,168,0.2); color: #2DD4A8; }
.bm-import-btn { width: 18px; height: 18px; border: none; background: rgba(0,0,0,0.06); border-radius: 50%; cursor: pointer; font-size: 9px; color: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
.bm-import-btn:hover { background: rgba(0,0,0,0.12); color: rgba(0,0,0,0.6); }

.bm-body { padding: 10px; overflow-y: auto; flex: 1; min-height: 0; }
.bm-grid { display: grid; gap: 6px; }
.bm-cell { aspect-ratio: 1; position: relative; background: rgba(255,255,255,0.6); border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; overflow: hidden; }
.bm-cell:not(.empty):hover { background: rgba(255,255,255,0.9); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.bm-cell.empty { border: 1.2px dashed rgba(0,0,0,0.1); }
.bm-link { display: flex; flex-direction: column; align-items: center; gap: 3px; text-decoration: none; padding: 4px 2px; width: 100%; height: 100%; justify-content: center; }
.bm-favicon { width: 20px; height: 20px; border-radius: 3px; flex-shrink: 0; }
.bm-initial { width: 20px; height: 20px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bm-site-name { font-size: 0.55rem; color: #555; font-weight: 500; text-align: center; max-width: 90%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bm-add-btn { width: 100%; height: 100%; border: none; background: transparent; font-size: 22px; color: rgba(0,0,0,0.12); cursor: pointer; transition: all 0.2s; font-weight: 300; display: flex; align-items: center; justify-content: center; }
.bm-add-btn:hover { color: #2DD4A8; transform: scale(1.15); }
.bm-del-btn { position: absolute; top: 2px; right: 2px; width: 14px; height: 14px; border-radius: 50%; border: none; background: rgba(0,0,0,0.3); color: #fff; cursor: pointer; font-size: 7px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
.bm-cell:hover .bm-del-btn { opacity: 1; }

.bm-import-body { display: flex; flex-direction: column; gap: 4px; padding: 0; }
.bm-import-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; font-weight: 700; color: #444; margin-bottom: 2px; }
.bm-import-cancel { width: 18px; height: 18px; border: none; background: rgba(0,0,0,0.06); border-radius: 50%; cursor: pointer; font-size: 8px; color: #999; display: flex; align-items: center; justify-content: center; }
.bm-import-cancel:hover { background: rgba(0,0,0,0.12); }
.bm-import-list { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
.bm-import-item { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
.bm-import-item:hover { background: rgba(0,0,0,0.04); }
.bm-folder-icon { font-size: 16px; flex-shrink: 0; }
.bm-folder-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }
.bm-folder-name { font-size: 0.75rem; font-weight: 600; color: #444; }
.bm-folder-preview { font-size: 0.6rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bm-folder-count { font-size: 0.6rem; color: rgba(0,0,0,0.3); background: rgba(0,0,0,0.05); padding: 1px 6px; border-radius: 8px; flex-shrink: 0; }
.bm-import-all { margin-top: auto; text-align: center; padding: 7px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; color: #2DD4A8; background: rgba(45,212,168,0.08); transition: background 0.2s; }
.bm-import-all:hover { background: rgba(45,212,168,0.15); }
</style>
