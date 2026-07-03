<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'

interface SearchRecord {
  query: string
  engine: string
  time: number
}

interface Engine {
  id: string
  name: string
  icon: string
  color: string
  url: string
}

const engines: Engine[] = [
  { id: 'baidu', name: '百度', icon: '🔵', color: '#2932E1', url: 'https://www.baidu.com/s?wd=' },
  { id: 'bing', name: '必应', icon: '🔍', color: '#00809D', url: 'https://www.bing.com/search?q=' },
  { id: 'google', name: '谷歌', icon: '🌐', color: '#4285F4', url: 'https://www.google.com/search?q=' },
  { id: 'zhihu', name: '知乎', icon: '💡', color: '#0066FF', url: 'https://www.zhihu.com/search?type=content&q=' },
  { id: 'csdn', name: 'CSDN', icon: '📘', color: '#FC5531', url: 'https://so.csdn.net/so/search?q=' },
  { id: 'bilibili', name: 'B站', icon: '📺', color: '#FB7299', url: 'https://search.bilibili.com/all?keyword=' },
]

const engineMap = Object.fromEntries(engines.map(e => [e.id, e]))

// Load persisted state
const savedDefault = localStorage.getItem('se-default-engine')
const defaultEngine = ref(savedDefault && engineMap[savedDefault] ? savedDefault : 'baidu')
const currentEngine = ref(defaultEngine.value)

const savedHistory = localStorage.getItem('se-history')
const history = ref<SearchRecord[]>([])
if (savedHistory) {
  try { history.value = JSON.parse(savedHistory) } catch { history.value = [] }
}

// Deduplicate and cap at 20
function saveHistory() {
  // Deduplicate by query+engine
  const seen = new Set<string>()
  const deduped: SearchRecord[] = []
  for (const h of history.value) {
    const key = h.query + '|' + h.engine
    if (!seen.has(key)) { seen.add(key); deduped.push(h) }
  }
  history.value = deduped.slice(0, 20)
  localStorage.setItem('se-history', JSON.stringify(history.value))
}

const query = ref('')
const inputRef = ref<HTMLInputElement>()

function setDefaultEngine(id: string) {
  defaultEngine.value = id
  currentEngine.value = id
  localStorage.setItem('se-default-engine', id)
}

function selectEngine(id: string) {
  currentEngine.value = id
}

function search() {
  const q = query.value.trim()
  if (!q) return
  const eng = engineMap[currentEngine.value]
  // Add to history
  history.value.unshift({ query: q, engine: currentEngine.value, time: Date.now() })
  saveHistory()
  // Open search
  window.open(eng.url + encodeURIComponent(q), '_blank')
  query.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    search()
  }
}

function searchWithRecord(record: SearchRecord) {
  const eng = engineMap[record.engine]
  window.open(eng.url + encodeURIComponent(record.query), '_blank')
}

function deleteHistory(index: number) {
  history.value.splice(index, 1)
  saveHistory()
}

function clearHistory() {
  history.value = []
  saveHistory()
}

// Scrollable history — show ~4 items
const historyListRef = ref<HTMLDivElement>()

// Title
const savedTitle = JSON.parse(localStorage.getItem('se-title') || 'null')
const title = ref(savedTitle ?? '🔎 搜索引擎')
watch(title, (v) => localStorage.setItem('se-title', JSON.stringify(v)))

const editingTitle = ref(false)
const titleInput = ref<HTMLInputElement>()
function startEditTitle() { editingTitle.value = true; setTimeout(() => titleInput.value?.focus(), 50) }
function saveTitle() { editingTitle.value = false; if (!title.value.trim()) title.value = '🔎 搜索引擎' }

// Drag
const props = defineProps<{ widgetId?: number }>()
const posKey = `searchengine-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? 420)
const y = ref(savedPos?.y ?? 280)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))

let dragging = false, sx = 0, sy = 0, ix = 0, iy = 0
function onDragStart(e: MouseEvent) {
  dragging = true; sx = e.clientX; sy = e.clientY; ix = x.value; iy = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) { if (!dragging) return; x.value = ix + (e.clientX - sx); y.value = iy + (e.clientY - sy) }
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }

function formatTime(ts: number) {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + '分钟前'
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + '小时前'
  return Math.floor(diff / 86400_000) + '天前'
}
</script>

<template>
  <div class="searchengine" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <div class="se-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
      <input
        v-if="editingTitle"
        ref="titleInput"
        v-model="title"
        class="se-title-input"
        @blur="saveTitle"
        @keyup.enter="saveTitle"
        @mousedown.stop
      />
      <span v-else class="se-label" @dblclick="startEditTitle">{{ title }}</span>
    </div>

    <!-- Body -->
    <div class="se-body">
      <!-- Engine selector -->
      <div class="se-engines">
        <button
          v-for="eng in engines"
          :key="eng.id"
          class="se-engine-btn"
          :class="{
            active: currentEngine === eng.id,
            default: defaultEngine === eng.id && currentEngine !== eng.id,
          }"
          :title="eng.name + (defaultEngine === eng.id ? ' (默认)' : '')"
          @click="selectEngine(eng.id)"
          @dblclick.prevent="setDefaultEngine(eng.id)"
        >
          <span class="se-engine-icon">{{ eng.icon }}</span>
          <span class="se-engine-name">{{ eng.name }}</span>
          <span v-if="defaultEngine === eng.id" class="se-default-badge">默认</span>
        </button>
      </div>

      <!-- Search input -->
      <div class="se-input-row">
        <span class="se-active-engine">{{ engineMap[currentEngine].icon }}</span>
        <input
          ref="inputRef"
          v-model="query"
          class="se-input"
          :placeholder="'在 ' + engineMap[currentEngine].name + ' 上搜索...'"
          @keydown="onKeydown"
        />
        <button class="se-search-btn" @click="search" :disabled="!query.trim()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>

      <!-- History — always visible, fixed height -->
      <div class="se-history">
        <div class="se-history-header">
          <span>🕐 搜索记录</span>
          <button v-if="history.length > 0" class="se-history-clear" @click="clearHistory" title="清空记录">清空</button>
        </div>
        <div ref="historyListRef" class="se-history-list">
          <div
            v-for="(h, i) in history"
            :key="i"
            class="se-history-item"
            @click="searchWithRecord(h)"
          >
            <span class="se-history-engine" :style="{ color: engineMap[h.engine].color }">
              {{ engineMap[h.engine].icon }}
            </span>
            <span class="se-history-query">{{ h.query }}</span>
            <span class="se-history-time">{{ formatTime(h.time) }}</span>
            <button class="se-history-del" @click.stop="deleteHistory(i)" title="删除">✕</button>
          </div>
          <div v-if="history.length === 0" class="se-history-empty">暂无搜索记录</div>
        </div>
      </div>
    </div>

    <!-- Hint tooltip -->
    <div class="se-hint">💡 单击切换引擎 · 双击设为默认</div>
  </div>
</template>

<style scoped>
.searchengine {
  position: absolute;
  width: 300px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px) saturate(1.5);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  z-index: 56;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.3s;
}
.searchengine:hover {
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.14);
}

/* Drag bar */
.se-drag-bar {
  height: 28px;
  background: rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.se-drag-bar:active { cursor: grabbing; }
.drag-dots { color: rgba(0, 0, 0, 0.2); font-size: 14px; letter-spacing: 3px; }
.se-label { font-size: 0.78rem; font-weight: 700; color: rgba(0, 0, 0, 0.45); cursor: pointer; }
.se-label:hover { color: rgba(0, 0, 0, 0.65); }
.se-title-input {
  width: 120px;
  font-size: 0.78rem;
  font-weight: 700;
  border: 1.5px solid #2DD4A8;
  border-radius: 4px;
  padding: 1px 4px;
  outline: none;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.9);
}

/* Body */
.se-body {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Engine selector */
.se-engines {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.se-engine-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 9px;
  border-radius: 8px;
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.se-engine-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}
.se-engine-btn.active {
  background: rgba(45, 212, 168, 0.12);
  border-color: #2DD4A8;
  box-shadow: 0 0 0 2px rgba(45, 212, 168, 0.15);
}
.se-engine-btn.default {
  border-style: solid;
}
.se-engine-icon { font-size: 15px; line-height: 1; }
.se-engine-name { font-size: 0.68rem; font-weight: 600; color: #555; }

.se-default-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  font-size: 0.5rem;
  font-weight: 700;
  color: #fff;
  background: #2DD4A8;
  padding: 1px 5px;
  border-radius: 6px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
}

/* Search input row */
.se-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 10px;
  padding: 0 10px;
  border: 1.5px solid rgba(0, 0, 0, 0.06);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.se-input-row:focus-within {
  border-color: #2DD4A8;
  box-shadow: 0 0 0 3px rgba(45, 212, 168, 0.1);
  background: rgba(255, 255, 255, 0.8);
}
.se-active-engine {
  font-size: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}
.se-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.9rem;
  font-weight: 500;
  color: #333;
  padding: 9px 0;
  font-family: -apple-system, 'PingFang SC', sans-serif;
  min-width: 0;
}
.se-input::placeholder { color: #bbb; font-weight: 400; }
.se-search-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: #2DD4A8;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}
.se-search-btn:hover:not(:disabled) { background: #26C498; transform: scale(1.05); }
.se-search-btn:active:not(:disabled) { transform: scale(0.95); }
.se-search-btn:disabled { opacity: 0.35; cursor: default; }

/* History */
.se-history {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 6px;
}
.se-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2px 4px;
  font-size: 0.7rem;
  color: #999;
  font-weight: 600;
}
.se-history-clear {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.65rem;
  color: #ccc;
  font-family: inherit;
  transition: color 0.2s;
  padding: 0;
}
.se-history-clear:hover { color: #e74c3c; }

.se-history-list {
  height: 152px; /* fixed: ~4 items at 38px each */
  overflow-y: auto;
  scroll-behavior: smooth;
}
.se-history-list::-webkit-scrollbar { width: 4px; }
.se-history-list::-webkit-scrollbar-track { background: transparent; border-radius: 2px; }
.se-history-list::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 2px; }
.se-history-list::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.2); }

.se-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.78rem;
}
.se-history-item:hover { background: rgba(0, 0, 0, 0.03); }

.se-history-engine {
  font-size: 16px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}
.se-history-query {
  flex: 1;
  color: #444;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.se-history-time {
  font-size: 0.6rem;
  color: #bbb;
  flex-shrink: 0;
  white-space: nowrap;
}
.se-history-del {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.08);
  cursor: pointer;
  font-size: 8px;
  color: #aaa;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.se-history-item:hover .se-history-del { opacity: 1; }
.se-history-del:hover { background: rgba(231, 76, 60, 0.2); color: #e74c3c; }

.se-history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.75rem;
  color: #d0d0d0;
  user-select: none;
}

/* Hint */
.se-hint {
  text-align: center;
  padding: 0 14px 10px;
  font-size: 0.6rem;
  color: #ccc;
  user-select: none;
}
</style>
