<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSites, addSiteItem, removeSiteItem, clearSites } from '../../db'
import FaviconImg from '../FaviconImg.vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

interface Site { id?: number; url: string; title: string }

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const sites = ref<Site[]>([])

const wid = computed(() => props.widgetId ?? 0)
onMounted(async () => { sites.value = await getSites(wid.value) })

// Title
const titleKey = `bm-title${props.widgetId != null ? '-' + props.widgetId : ''}`
const saved = JSON.parse(localStorage.getItem(titleKey) || 'null')
const title = ref(saved ?? '收藏夹')
watch(title, (v) => localStorage.setItem(titleKey, JSON.stringify(v)))

// Layout
const layoutKey = `bm-layout${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedLayout = localStorage.getItem(layoutKey) || '3x3'
const layouts = ['3x3', '4x4', '2x4', '4x2', 'list'] as const
type Layout = (typeof layouts)[number]
const currentLayout = ref<Layout>(savedLayout as Layout)
watch(currentLayout, (v) => localStorage.setItem(layoutKey, v))

const layoutLabels: Record<Layout, string> = { '3x3': '3×3', '4x4': '4×4', '2x4': '2×4', '4x2': '4×2', list: '≡' }
const isList = computed(() => currentLayout.value === 'list')
const cols = computed(() => (isList.value ? 1 : parseInt(currentLayout.value[0])))
const rows = computed(() => (isList.value ? 8 : parseInt(currentLayout.value[2])))

// Max body height = visible rows × (cell + gap) + padding
const bodyMaxH = computed(() => {
  if (isList.value) {
    const rowH = 34, gap = 4
    return rows.value * rowH + (rows.value - 1) * gap + 20
  }
  const w = { '3x3': 210, '4x4': 280, '2x4': 150, '4x2': 240, list: 230 }[currentLayout.value] || 210
  const cellW = (w - 20 - (cols.value - 1) * 6) / cols.value
  return rows.value * cellW + (rows.value - 1) * 6 + 20
})

const displaySlots = computed(() => {
  // Show all sites + one empty "+" slot at the end
  const slots: (Site | null)[] = [...sites.value]
  slots.push(null) // add button
  return slots
})

// Add panel
const showAdd = ref(false)
const addRows = ref<{ url: string; title: string }[]>([{ url: '', title: '' }])

function openAddPanel() {
  addRows.value = [{ url: '', title: '' }]
  showAdd.value = true
}

function addRow() {
  addRows.value.push({ url: '', title: '' })
}

function removeRow(index: number) {
  if (addRows.value.length <= 1) return
  addRows.value.splice(index, 1)
}

async function submitAdd() {
  let count = 0
  for (const row of addRows.value) {
    const url = row.url.trim()
    if (!url) continue
    let fixed = url
    if (!/^https?:\/\//.test(fixed)) fixed = 'https://' + fixed
    await addSiteItem(fixed, row.title.trim() || fixed, wid.value)
    count++
  }
  if (count === 0) { ElMessage.warning('请至少输入一个网址'); return }
  sites.value = await getSites(wid.value)
  showAdd.value = false
  ElMessage.success(`已添加 ${count} 个网址`)
}
async function removeSite(id: number) { await removeSiteItem(id); sites.value = await getSites(wid.value) }

// Favicon fallback helpers
function siteInitial(t: string) { return (t || '?').charAt(0).toUpperCase() }
function initialColor(t: string) {
  const colors = ['#ff6b6b','#2DD4A8','#3B82F6','#F59E0B','#8B5CF6','#EC4899','#06B6D4']
  let hash = 0; for (let i = 0; i < t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

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
  await clearSites(wid.value)
  for (const b of folder.bookmarks) await addSiteItem(b.url, b.title, wid.value)
  sites.value = await getSites(wid.value)
  importMode.value = false
  ElMessage.success(`「${folder.name}」导入 ${folder.bookmarks.length} 个网址`)
}

async function importAll() {
  await clearSites(wid.value)
  let count = 0
  for (const f of importFolders.value) {
    for (const b of f.bookmarks) { await addSiteItem(b.url, b.title, wid.value); count++ }
  }
  sites.value = await getSites(wid.value)
  importMode.value = false
  ElMessage.success(`全部导入 ${count} 个网址`)
}

function cancelImport() { importMode.value = false }

// Drag
const posKey = `bookmarks-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 100, 100, true)
</script>

<template>
  <div class="bookmarks widget-card" :class="`layout-${currentLayout}`" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="header" :on-drag-start="onDragStart" v-model:title="title" :editable="true" title-placeholder="收藏夹">
      <template v-if="!importMode">
        <div class="bm-layouts">
          <button v-for="l in layouts" :key="l" class="bm-layout-btn" :class="{ active: currentLayout === l }" @click="currentLayout = l" :title="l === 'list' ? '列表模式' : l">{{ layoutLabels[l] }}</button>
        </div>
        <button class="bm-import-btn" @click="triggerImport" title="导入浏览器收藏夹">📥</button>
      </template>
    </DragBar>

    <!-- List mode -->
    <div v-if="!importMode && isList" class="bm-body bm-list" :style="{ maxHeight: bodyMaxH + 'px' }">
      <div v-for="(slot, i) in displaySlots" :key="i" class="bm-list-row" :class="{ empty: !slot }">
        <template v-if="slot">
          <a :href="slot.url" target="_blank" class="bm-link-row" @click.stop :title="slot.title">
            <FaviconImg :url="slot.url" :fallback-text="siteInitial(slot.title)" :fallback-color="initialColor(slot.title)" />
            <span class="bm-list-name">{{ slot.title }}</span>
          </a>
          <button class="bm-del-btn bm-list-del" @click.stop="removeSite(slot.id!)">✕</button>
        </template>
        <button v-else class="bm-list-add" @click="openAddPanel">＋ 添加网址</button>
      </div>
    </div>

    <!-- Normal grid -->
    <div v-else-if="!importMode" class="bm-body bm-grid" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxHeight: bodyMaxH + 'px' }">
      <div v-for="(slot, i) in displaySlots" :key="i" class="bm-cell" :class="{ empty: !slot }">
        <template v-if="slot">
          <a :href="slot.url" target="_blank" class="bm-link" @click.stop :title="slot.title">
            <FaviconImg :url="slot.url" :fallback-text="siteInitial(slot.title)" :fallback-color="initialColor(slot.title)" />
            <span class="bm-site-name">{{ slot.title }}</span>
          </a>
          <button class="bm-del-btn" @click.stop="removeSite(slot.id!)">✕</button>
        </template>
        <button v-else class="bm-add-btn" @click="openAddPanel">+</button>
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

    <!-- Multi-row add overlay -->
    <div v-if="showAdd" class="bm-add-overlay" @mousedown.stop>
      <div class="bm-add-panel">
        <div class="bm-add-header">
          <span>添加网址</span>
          <button class="bm-add-close" @click="showAdd = false">✕</button>
        </div>
        <div class="bm-add-rows">
          <div v-for="(row, i) in addRows" :key="i" class="bm-add-row">
            <input v-model="row.url" placeholder="网址 https://..." class="bm-add-input" @keyup.enter="submitAdd" />
            <input v-model="row.title" placeholder="名称" class="bm-add-input bm-add-title" />
            <button v-if="addRows.length > 1" class="bm-add-remove" @click="removeRow(i)">✕</button>
          </div>
        </div>
        <div class="bm-add-actions">
          <button class="bm-add-more" @click="addRow">+ 添加网址</button>
          <div class="bm-add-right">
            <el-button @click="showAdd = false" size="small">取消</el-button>
            <el-button type="primary" @click="submitAdd" size="small">保存全部</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookmarks {
  position: absolute;
  z-index: 56; display: flex; flex-direction: column;
}
.layout-3x3 { width: 210px; }
.layout-4x4 { width: 280px; }
.layout-2x4 { width: 150px; }
.layout-4x2 { width: 240px; }
.layout-list { width: 230px; }

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
.bm-site-name { font-size: 0.68rem; color: #444; font-weight: 600; text-align: center; max-width: 90%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

/* List mode */
.bm-list { display: flex; flex-direction: column; gap: 4px; }
.bm-list-row { display: flex; align-items: center; gap: 8px; padding: 0 6px; height: 34px; border-radius: 8px; background: rgba(255,255,255,0.6); transition: background 0.2s; flex-shrink: 0; }
.bm-list-row:not(.empty):hover { background: rgba(255,255,255,0.9); }
.bm-list-row.empty { border: 1.2px dashed rgba(0,0,0,0.1); height: 32px; }
.bm-link-row { display: flex; align-items: center; gap: 8px; text-decoration: none; flex: 1; min-width: 0; }
.bm-list-name { font-size: 0.75rem; color: #444; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bm-list-del { position: static; top: auto; right: auto; margin-left: auto; opacity: 0; }
.bm-list-row:hover .bm-list-del { opacity: 1; }
.bm-list-add { flex: 1; height: 100%; border: none; background: transparent; font-size: 0.72rem; font-weight: 600; color: rgba(0,0,0,0.25); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: inherit; transition: color 0.2s; }
.bm-list-add:hover { color: #2DD4A8; }
.bm-add-btn { width: 100%; height: 100%; border: none; background: transparent; font-size: 22px; color: rgba(0,0,0,0.12); cursor: pointer; transition: all 0.2s; font-weight: 300; display: flex; align-items: center; justify-content: center; }
.bm-add-btn:hover { color: #2DD4A8; transform: scale(1.15); }
.bm-del-btn { position: absolute; top: 2px; right: 2px; width: 14px; height: 14px; border-radius: 50%; border: none; background: rgba(0,0,0,0.3); color: #fff; cursor: pointer; font-size: 7px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
.bm-cell:hover .bm-del-btn { opacity: 1; }
.bm-add-panel {
  width: 100%; max-height: 100%; display: flex; flex-direction: column;
  padding: 0 14px 14px;
}
.bm-add-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px; font-size: 0.85rem; font-weight: 700; color: #444;
}
.bm-add-close { width: 22px; height: 22px; border: none; background: rgba(0,0,0,0.06); border-radius: 50%; cursor: pointer; font-size: 10px; color: #999; display: flex; align-items: center; justify-content: center; }
.bm-add-close:hover { background: rgba(0,0,0,0.12); }
.bm-add-rows { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; flex: 1; }
.bm-add-row { display: flex; gap: 6px; align-items: center; }
.bm-add-input {
  flex: 1; padding: 8px 10px; border: 1.5px solid #e0e0e0; border-radius: 8px;
  font-size: 0.8rem; outline: none; font-family: inherit;
  transition: border-color 0.2s; min-width: 0;
}
.bm-add-input:focus { border-color: #2DD4A8; }
.bm-add-title { flex: 0 0 30%; max-width: 30%; }
.bm-add-remove { width: 24px; height: 24px; border: none; background: rgba(0,0,0,0.06); border-radius: 50%; cursor: pointer; font-size: 10px; color: #999; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bm-add-remove:hover { background: rgba(231,76,60,0.1); color: #e74c3c; }
.bm-add-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; flex-shrink: 0; }
.bm-add-more { border: 1.5px dashed #d0d0d0; background: none; cursor: pointer; font-size: 0.75rem; color: #999; padding: 6px 12px; border-radius: 8px; transition: all 0.2s; font-family: inherit; }
.bm-add-more:hover { border-color: #2DD4A8; color: #2DD4A8; }
.bm-add-right { display: flex; gap: 6px; }

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
