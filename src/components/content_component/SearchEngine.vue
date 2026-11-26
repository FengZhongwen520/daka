<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import { useHistoryList } from '../../composables/useHistoryList'
import { formatTime } from '../../utils/time'
import DragBar from '../common/DragBar.vue'
import FaviconImg from '../FaviconImg.vue'

import { getItem, setItem } from '../../storage'
interface SearchRecord {
  query: string
  engine: string
  time: number
}

interface Engine {
  id: string
  name: string
  home: string
  color: string
  url: string
}

const engines: Engine[] = [
  { id: 'baidu', name: '百度', home: 'https://www.baidu.com', color: '#2932E1', url: 'https://www.baidu.com/s?wd=' },
  { id: 'bing', name: '必应', home: 'https://www.bing.com', color: '#00809D', url: 'https://www.bing.com/search?q=' },
  { id: 'google', name: '谷歌', home: 'https://www.google.com', color: '#4285F4', url: 'https://www.google.com/search?q=' },
  { id: 'zhihu', name: '知乎', home: 'https://www.zhihu.com', color: '#0066FF', url: 'https://www.zhihu.com/search?type=content&q=' },
  { id: 'csdn', name: 'CSDN', home: 'https://www.csdn.net', color: '#FC5531', url: 'https://so.csdn.net/so/search?q=' },
  { id: 'bilibili', name: 'B站', home: 'https://www.bilibili.com', color: '#FB7299', url: 'https://search.bilibili.com/all?keyword=' },
]

const engineMap = Object.fromEntries(engines.map(e => [e.id, e]))


const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const sk = `se${props.widgetId != null ? '-' + props.widgetId : ''}`

// Load persisted state
const savedDefault = getItem(`${sk}-default-engine`)
const defaultEngine = ref(savedDefault && engineMap[savedDefault] ? savedDefault : 'baidu')
const currentEngine = ref(defaultEngine.value)

const historyKey = `${sk}-history`
const { history, addRecord, deleteRecord, clearHistory } = useHistoryList<SearchRecord>(
  historyKey,
  (h) => h.query + '|' + h.engine,
)

const query = ref('')
const showHistory = ref(false)
let historyCloseTimer: ReturnType<typeof setTimeout> | null = null

function openHistory() {
  if (historyCloseTimer) clearTimeout(historyCloseTimer)
  showHistory.value = true
}

function scheduleHistoryClose() {
  if (historyCloseTimer) clearTimeout(historyCloseTimer)
  historyCloseTimer = setTimeout(() => {
    showHistory.value = false
  }, 120)
}

function keepHistoryOpen() {
  if (historyCloseTimer) clearTimeout(historyCloseTimer)
}

function setDefaultEngine(id: string) {
  defaultEngine.value = id
  currentEngine.value = id
  setItem(`${sk}-default-engine`, id)
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
  showHistory.value = false
}

function engineInitial(engine: Engine) {
  return engine.name.charAt(0).toUpperCase()
}

// Drag
const posKey = `searchengine-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 420, 280, false)

onUnmounted(() => {
  if (historyCloseTimer) clearTimeout(historyCloseTimer)
})

</script>

<template>
  <div class="searchengine widget-card" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="overlay" :on-drag-start="onDragStart" />

    <!-- Body -->
    <div class="se-body">
      <!-- Search input -->
      <div class="se-input-row field-shell">
        <span class="se-active-engine">
          <FaviconImg
            :url="engineMap[currentEngine].home"
            :fallback-text="engineInitial(engineMap[currentEngine])"
            :fallback-color="engineMap[currentEngine].color"
            :size="20"
          />
        </span>
        <input
          v-model="query"
          class="se-input"
          aria-label="搜索内容"
          :placeholder="'在 ' + engineMap[currentEngine].name + ' 上搜索...'"
          @focus="openHistory"
          @blur="scheduleHistoryClose"
          @keydown="onKeydown"
        />
        <button
          class="se-search-btn"
          aria-label="搜索"
          @click="search"
          :disabled="!query.trim()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7.5" />
            <path d="m16.5 16.5 4 4" />
          </svg>
        </button>
      </div>

      <!-- Engine selector -->
      <div class="se-engines" aria-label="搜索引擎">
        <button
          v-for="eng in engines"
          :key="eng.id"
          class="se-engine-btn"
          :class="{ active: currentEngine === eng.id }"
          :title="eng.name + (defaultEngine === eng.id ? ' (默认)' : '')"
          @click="selectEngine(eng.id)"
        >
          <span class="se-engine-icon">
            <FaviconImg
              :url="eng.home"
              :fallback-text="engineInitial(eng)"
              :fallback-color="eng.color"
              :size="18"
            />
          </span>
          <span class="se-engine-name">{{ eng.name }}</span>
          <span
            v-if="defaultEngine === eng.id"
            class="se-default-dot"
            title="默认引擎"
            aria-label="默认引擎"
          />
        </button>
        <button
          type="button"
          class="se-default-btn"
          :class="{ active: currentEngine === defaultEngine }"
          :disabled="currentEngine === defaultEngine"
          :title="currentEngine === defaultEngine ? '当前已是默认引擎' : `将${engineMap[currentEngine].name}设为默认`"
          @click="setDefaultEngine(currentEngine)"
        >
          {{ currentEngine === defaultEngine ? '★ 默认' : '☆ 设默认' }}
        </button>
      </div>

      <!-- History — only while the input is focused -->
      <Transition name="se-history">
        <div
          v-if="showHistory"
          class="se-history"
          @mousedown="keepHistoryOpen"
        >
          <div class="se-history-header">
            <span>搜索记录</span>
            <button
              v-if="history.length > 0"
              class="se-history-clear"
              @mousedown.prevent="keepHistoryOpen"
              @click="clearHistory"
            >清空</button>
          </div>
          <div class="se-history-list">
            <div
              v-for="(h, i) in history"
              :key="i"
              class="se-history-item"
              role="button"
              tabindex="0"
              @click="searchWithRecord(h)"
              @keydown.enter.prevent="searchWithRecord(h)"
            >
              <span class="se-history-engine">
                <FaviconImg
                  :url="engineMap[h.engine].home"
                  :fallback-text="engineInitial(engineMap[h.engine])"
                  :fallback-color="engineMap[h.engine].color"
                  :size="16"
                />
              </span>
              <span class="se-history-query">{{ h.query }}</span>
              <span class="se-history-time">{{ formatTime(h.time) }}</span>
              <button
                type="button"
                class="se-history-del"
                title="删除记录"
                @click.stop="deleteRecord(i)"
              >×</button>
            </div>
            <div v-if="history.length === 0" class="se-history-empty">暂无搜索记录</div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Hint tooltip -->
    <div class="se-hint">单击切换引擎 · 可单独设为默认</div>
  </div>
</template>

<style scoped>
.searchengine {
  position: absolute;
  width: 320px;
  /* Above every draggable widget, below app controls, dialogs and menus. */
  z-index: 199;
  display: flex;
  flex-direction: column;
}

.searchengine :deep(.drag-bar--overlay) {
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
.searchengine:hover :deep(.drag-bar--overlay),
.searchengine:focus-within :deep(.drag-bar--overlay) { opacity: 0.55; }
.searchengine :deep(.drag-bar--overlay:hover) {
  background: color-mix(in srgb, var(--color-ink) 13%, transparent);
  opacity: 0.85;
}
.searchengine :deep(.drag-bar__dots) {
  font-size: 9px;
  letter-spacing: 2px;
  line-height: 1;
}

/* Body */
.se-body {
  padding: 17px 15px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Engine selector */
.se-engines {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.se-engine-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
  font-family: inherit;
}
.se-engine-btn:hover {
  background: color-mix(in srgb, var(--color-surface) 60%, transparent);
  border-color: color-mix(in srgb, var(--color-border) 72%, transparent);
}
.se-engine-btn.active {
  background: var(--color-primary-soft);
  border-color: color-mix(in srgb, var(--color-primary) 34%, transparent);
}
.se-engine-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.se-engine-name { font-size: 0.67rem; font-weight: 600; color: var(--color-ink-2); }
.se-engine-btn.active .se-engine-name { color: var(--color-ink); }
.se-default-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 5px;
  margin-left: 1px;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 10%, transparent);
}
.se-default-btn {
  min-height: 26px;
  margin-left: auto;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 52%, transparent);
  color: var(--color-ink-3);
  cursor: pointer;
  font: 650 0.58rem/1 var(--font-family);
}
.se-default-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.se-default-btn.active,
.se-default-btn:disabled { color: var(--color-primary); opacity: 0.72; cursor: default; }

/* Search input row */
.se-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  background: color-mix(in srgb, var(--color-surface) 82%, transparent);
  border-radius: 12px;
  padding: 0 7px 0 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  box-shadow: 0 5px 18px rgba(15, 23, 42, 0.055);
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}
.se-input-row:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border));
  box-shadow:
    var(--focus-ring),
    0 8px 24px rgba(15, 23, 42, 0.06);
  background: var(--color-surface);
}
.se-active-engine {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.se-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.94rem;
  font-weight: 520;
  color: var(--color-ink);
  padding: 12px 0;
  font-family: var(--font-family);
  min-width: 0;
}
.se-input::placeholder { color: var(--color-ink-3); font-weight: 400; }
.se-search-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: none;
  background: var(--color-ink);
  color: var(--color-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 160ms ease, color 160ms ease, opacity 160ms ease;
  flex-shrink: 0;
}
.se-search-btn svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
.se-search-btn:hover:not(:disabled) {
  background: var(--color-primary);
  color: #12382f;
}
.se-search-btn:active:not(:disabled) { transform: scale(0.97); }
.se-search-btn:disabled { opacity: 0.35; cursor: default; }

/* History */
.se-history {
  max-height: 180px;
  padding-top: 7px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
}
.se-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2px 4px;
  font-size: 0.66rem;
  color: var(--color-ink-3);
  font-weight: 600;
}
.se-history-clear {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.65rem;
  color: var(--color-ink-3);
  font-family: inherit;
  transition: color 0.2s;
  padding: 0;
}
.se-history-clear:hover { color: var(--color-danger); }

.se-history-list {
  max-height: 140px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.se-history-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.78rem;
  font-family: inherit;
  text-align: left;
}
.se-history-item:hover { background: rgba(0, 0, 0, 0.03); }
html.dark .se-history-item:hover { background: rgba(255, 255, 255, 0.05); }

.se-history-engine {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.se-history-query {
  flex: 1;
  color: var(--color-ink);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.se-history-time {
  font-size: 0.6rem;
  color: var(--color-ink-3);
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
  color: var(--color-ink-3);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.se-history-item:hover .se-history-del { opacity: 1; }
.se-history-del:hover { background: color-mix(in srgb, var(--color-danger) 20%, transparent); color: var(--color-danger); }
html.dark .se-history-del { background: rgba(255, 255, 255, 0.12); }

.se-history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.75rem;
  color: var(--color-ink-3);
  user-select: none;
}

.se-history-enter-active,
.se-history-leave-active {
  overflow: hidden;
  transition: max-height 180ms ease, opacity 140ms ease;
}
.se-history-enter-from,
.se-history-leave-to {
  max-height: 0;
  opacity: 0;
}

/* Hint */
.se-hint {
  text-align: center;
  padding: 0 14px 10px;
  font-size: 0.6rem;
  color: var(--color-ink-3);
  user-select: none;
  opacity: 0;
  transition: opacity 150ms ease;
}
.searchengine:hover .se-hint,
.searchengine:focus-within .se-hint { opacity: 0.72; }

</style>
