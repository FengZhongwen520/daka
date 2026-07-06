<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import { useHistoryList } from '../../composables/useHistoryList'
import { formatTime } from '../../utils/time'
import DragBar from '../common/DragBar.vue'

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


const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const sk = `se${props.widgetId != null ? '-' + props.widgetId : ''}`

// Load persisted state
const savedDefault = localStorage.getItem(`${sk}-default-engine`)
const defaultEngine = ref(savedDefault && engineMap[savedDefault] ? savedDefault : 'baidu')
const currentEngine = ref(defaultEngine.value)

const historyKey = `${sk}-history`
const { history, addRecord, deleteRecord, clearHistory } = useHistoryList<SearchRecord>(
  historyKey,
  (h) => h.query + '|' + h.engine,
)

const query = ref('')

function setDefaultEngine(id: string) {
  defaultEngine.value = id
  currentEngine.value = id
  localStorage.setItem(`${sk}-default-engine`, id)
}

function selectEngine(id: string) {
  currentEngine.value = id
}

function search() {
  const q = query.value.trim()
  if (!q) return
  const eng = engineMap[currentEngine.value]
  // Add to history
  addRecord({ query: q, engine: currentEngine.value, time: Date.now() })
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

// Scrollable history — show ~4 items

// Title
const savedTitle = JSON.parse(localStorage.getItem(`${sk}-title`) || 'null')
const title = ref(savedTitle ?? '🔎 搜索引擎')
watch(title, (v) => localStorage.setItem(`${sk}-title`, JSON.stringify(v)))

// Drag
const posKey = `searchengine-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 420, 280, false)

</script>

<template>
  <div class="searchengine widget-card" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <DragBar variant="header" :on-drag-start="onDragStart" v-model:title="title" :editable="true" title-placeholder="🔎 搜索引擎" />

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
            <button class="se-history-del" @click.stop="deleteRecord(i)" title="删除">✕</button>
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
  z-index: 56;
  display: flex;
  flex-direction: column;
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
