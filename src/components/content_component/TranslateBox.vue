<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'

interface TransRecord {
  from: string
  to: string
  source: string
  target: string
  time: number
}

type LangDir = 'zh2en' | 'en2zh'

function hasChinese(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text)
}

// Load persisted state
const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const tk = `tr${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedDir = localStorage.getItem(`${tk}-direction`)
const direction = ref<LangDir>((savedDir === 'zh2en' || savedDir === 'en2zh') ? savedDir : 'en2zh')
watch(direction, (v) => localStorage.setItem(`${tk}-direction`, v))

const savedHistory = localStorage.getItem(`${tk}-history`)
const history = ref<TransRecord[]>([])
if (savedHistory) {
  try { history.value = JSON.parse(savedHistory) } catch { history.value = [] }
}

function saveHistory() {
  const seen = new Set<string>()
  const deduped: TransRecord[] = []
  for (const h of history.value) {
    const key = h.source + '|' + h.from + '|' + h.to
    if (!seen.has(key)) { seen.add(key); deduped.push(h) }
  }
  history.value = deduped.slice(0, 20)
  localStorage.setItem(`${tk}-history`, JSON.stringify(history.value))
}

const inputText = ref('')
const outputText = ref('')
const translating = ref(false)
const inputRef = ref<HTMLTextAreaElement>()

// Auto-detect language as user types
let detectTimer: ReturnType<typeof setTimeout> | null = null
function onInput() {
  const text = inputText.value.trim()
  if (!text) return
  if (detectTimer) clearTimeout(detectTimer)
  detectTimer = setTimeout(() => {
    if (hasChinese(text)) {
      direction.value = 'zh2en'
    } else {
      direction.value = 'en2zh'
    }
  }, 300)
}

async function translate() {
  const text = inputText.value.trim()
  if (!text || translating.value) return

  translating.value = true
  const [from, to] = direction.value === 'zh2en' ? ['zh-CN', 'en'] : ['en', 'zh-CN']

  try {
    const resp = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    )
    const data = await resp.json()
    const result = data.responseData?.translatedText || '翻译失败'
    outputText.value = result

    history.value.unshift({
      from,
      to,
      source: text,
      target: result,
      time: Date.now(),
    })
    saveHistory()
  } catch {
    outputText.value = '网络错误，请重试'
  } finally {
    translating.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    translate()
  }
}

function restoreRecord(record: TransRecord) {
  inputText.value = record.source
  outputText.value = record.target
  direction.value = record.from === 'zh-CN' ? 'zh2en' : 'en2zh'
}

function deleteRecord(index: number) {
  history.value.splice(index, 1)
  saveHistory()
}

function clearHistory() {
  history.value = []
  saveHistory()
}

function swapLanguages() {
  if (!outputText.value) return
  inputText.value = outputText.value
  outputText.value = ''
  direction.value = direction.value === 'zh2en' ? 'en2zh' : 'zh2en'
  nextTick(() => inputRef.value?.focus())
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(outputText.value)
  } catch {
    // fallback
  }
}

// Title
const savedTitle = JSON.parse(localStorage.getItem(`${tk}-title`) || 'null')
const title = ref(savedTitle ?? '🌐 翻译')
watch(title, (v) => localStorage.setItem(`${tk}-title`, JSON.stringify(v)))

const editingTitle = ref(false)
const titleInput = ref<HTMLInputElement>()
function startEditTitle() { editingTitle.value = true; setTimeout(() => titleInput.value?.focus(), 50) }
function saveTitle() { editingTitle.value = false; if (!title.value.trim()) title.value = '🌐 翻译' }

// Drag
const posKey = `translate-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? props.initialX ?? 520)
const y = ref(savedPos?.y ?? props.initialY ?? 200)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))

let dragging = false, sx = 0, sy = 0, ix = 0, iy = 0
function onDragStart(e: MouseEvent) {
  dragging = true; sx = e.clientX; sy = e.clientY; ix = x.value; iy = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) { if (!dragging) return; x.value = ix + (e.clientX - sx); y.value = iy + (e.clientY - sy) }
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }

function formatTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + '分钟前'
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + '小时前'
  return Math.floor(diff / 86400_000) + '天前'
}

const fromLabel = computed(() => direction.value === 'zh2en' ? '中文' : 'English')
const toLabel = computed(() => direction.value === 'zh2en' ? 'English' : '中文')
const fromFlag = computed(() => direction.value === 'zh2en' ? '🇨🇳' : '🇺🇸')
const toFlag = computed(() => direction.value === 'zh2en' ? '🇺🇸' : '🇨🇳')
</script>

<template>
  <div class="translate-box" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <div class="tr-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
      <input
        v-if="editingTitle"
        ref="titleInput"
        v-model="title"
        class="tr-title-input"
        @blur="saveTitle"
        @keyup.enter="saveTitle"
        @mousedown.stop
      />
      <span v-else class="tr-label" @dblclick="startEditTitle">{{ title }}</span>
      <span class="tr-auto-badge">自动检测</span>
    </div>

    <!-- Body — fixed layout -->
    <div class="tr-body">
      <!-- Language tabs -->
      <div class="tr-langs">
        <button class="tr-lang-btn" :class="{ active: direction === 'zh2en' }" @click="direction = 'zh2en'">
          🇨🇳 中文 → 🇺🇸 English
        </button>
        <button class="tr-lang-btn" :class="{ active: direction === 'en2zh' }" @click="direction = 'en2zh'">
          🇺🇸 English → 🇨🇳 中文
        </button>
      </div>

      <!-- Input — fixed height -->
      <div class="tr-input-area">
        <div class="tr-field-header">
          <span class="tr-field-lang">{{ fromFlag }} {{ fromLabel }}</span>
          <span class="tr-char-count">{{ inputText.length }}/500</span>
        </div>
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="tr-textarea"
          :placeholder="direction === 'zh2en' ? '输入中文...' : 'Enter English...'"
          @input="onInput"
          @keydown="onKeydown"
        ></textarea>
      </div>

      <!-- Action bar -->
      <div class="tr-actions">
        <button class="tr-swap-btn" @click="swapLanguages" :disabled="!outputText" title="交换语言">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
          </svg>
        </button>
        <button class="tr-btn" @click="translate" :disabled="!inputText.trim() || translating">
          <span v-if="translating" class="tr-spinner"></span>
          <span v-else>翻译</span>
        </button>
      </div>

      <!-- Output — always visible, fixed height -->
      <div class="tr-output-area" :class="{ empty: !outputText, error: outputText === '网络错误，请重试' || outputText === '翻译失败' }">
        <div class="tr-field-header">
          <span class="tr-field-lang">{{ toFlag }} {{ toLabel }}</span>
          <button v-if="outputText" class="tr-copy-btn" @click="copyOutput" title="复制">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
        </div>
        <div v-if="outputText" class="tr-output-text">{{ outputText }}</div>
        <div v-else class="tr-output-placeholder">译文将显示在这里...</div>
      </div>

      <!-- History — always visible, fixed height with internal scroll -->
      <div class="tr-history">
        <div class="tr-history-header">
          <span>📋 翻译记录</span>
          <button v-if="history.length > 0" class="tr-history-clear" @click="clearHistory" title="清空">清空</button>
        </div>
        <div class="tr-history-list">
          <div
            v-for="(h, i) in history"
            :key="i"
            class="tr-history-item"
            @click="restoreRecord(h)"
          >
            <span class="tr-h-flags">{{ h.from === 'zh-CN' ? '🇨🇳' : '🇺🇸' }}→{{ h.to === 'zh-CN' ? '🇨🇳' : '🇺🇸' }}</span>
            <span class="tr-h-source">{{ h.source }}</span>
            <span class="tr-h-arrow2">→</span>
            <span class="tr-h-target">{{ h.target }}</span>
            <span class="tr-history-time">{{ formatTime(h.time) }}</span>
            <button class="tr-history-del" @click.stop="deleteRecord(i)" title="删除">✕</button>
          </div>
          <div v-if="history.length === 0" class="tr-history-empty">暂无翻译记录</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.translate-box {
  position: absolute;
  width: 320px;
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
.translate-box:hover {
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.14);
}

/* Drag bar */
.tr-drag-bar {
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
.tr-drag-bar:active { cursor: grabbing; }
.drag-dots { color: rgba(0, 0, 0, 0.2); font-size: 14px; letter-spacing: 3px; }
.tr-label { font-size: 0.78rem; font-weight: 700; color: rgba(0, 0, 0, 0.45); cursor: pointer; }
.tr-label:hover { color: rgba(0, 0, 0, 0.65); }
.tr-title-input {
  width: 100px; font-size: 0.78rem; font-weight: 700;
  border: 1.5px solid #2DD4A8; border-radius: 4px;
  padding: 1px 4px; outline: none; font-family: inherit;
  background: rgba(255, 255, 255, 0.9);
}
.tr-auto-badge {
  margin-left: auto;
  font-size: 0.55rem; font-weight: 700; color: #2DD4A8;
  background: rgba(45, 212, 168, 0.1);
  padding: 2px 6px; border-radius: 6px; white-space: nowrap;
}

/* Body — no gap growth */
.tr-body {
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Language tabs */
.tr-langs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.tr-lang-btn {
  flex: 1;
  padding: 6px 4px;
  border-radius: 8px;
  border: 1.5px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  color: #666;
  white-space: nowrap;
}
.tr-lang-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.12);
}
.tr-lang-btn.active {
  background: rgba(45, 212, 168, 0.1);
  border-color: #2DD4A8;
  color: #333;
}

/* Input area — fixed height */
.tr-input-area {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  padding: 8px 10px;
  border: 1.5px solid rgba(0, 0, 0, 0.05);
  transition: border-color 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.tr-input-area:focus-within {
  border-color: #2DD4A8;
  box-shadow: 0 0 0 3px rgba(45, 212, 168, 0.08);
  background: rgba(255, 255, 255, 0.8);
}
.tr-field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  height: 16px;
}
.tr-field-lang {
  font-size: 0.65rem;
  font-weight: 700;
  color: #999;
}
.tr-char-count {
  font-size: 0.6rem;
  color: #ccc;
}
.tr-textarea {
  width: 100%;
  height: 18px; /* fixed: ~3 lines */
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  font-size: 0.88rem;
  font-weight: 500;
  color: #333;
  font-family: -apple-system, 'PingFang SC', sans-serif;
  line-height: 1.45;
  padding: 0;
}
.tr-textarea::placeholder { color: #ccc; font-weight: 400; }

/* Actions */
.tr-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  flex-shrink: 0;
}
.tr-swap-btn {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.03);
  cursor: pointer;
  color: #888;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.tr-swap-btn:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); color: #555; }
.tr-swap-btn:disabled { opacity: 0.3; cursor: default; }

.tr-btn {
  padding: 7px 22px;
  border-radius: 8px;
  border: none;
  background: #2DD4A8;
  color: #fff;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 700;
  font-family: inherit;
  transition: all 0.2s;
  min-width: 64px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.tr-btn:hover:not(:disabled) { background: #26C498; }
.tr-btn:active:not(:disabled) { transform: scale(0.97); }
.tr-btn:disabled { opacity: 0.4; cursor: default; }

.tr-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Output — always visible, fixed height */
.tr-output-area {
  background: rgba(45, 212, 168, 0.04);
  border-radius: 10px;
  padding: 8px 10px;
  border: 1.5px solid rgba(45, 212, 168, 0.12);
  flex-shrink: 0;
  height: 60px;
  overflow-y: auto;
}
.tr-output-area.empty {
  background: rgba(0, 0, 0, 0.015);
  border-color: rgba(0, 0, 0, 0.04);
}
.tr-output-area.error {
  background: rgba(231, 76, 60, 0.04);
  border-color: rgba(231, 76, 60, 0.15);
}
.tr-output-area.error .tr-output-text {
  color: #e74c3c;
}
.tr-output-text {
  font-size: 0.88rem;
  color: #333;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.tr-output-placeholder {
  font-size: 0.82rem;
  color: #d0d0d0;
  line-height: 1.45;
  font-style: italic;
}
.tr-copy-btn {
  width: 22px; height: 22px;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 5px;
  cursor: pointer;
  color: #999;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.tr-copy-btn:hover { background: rgba(0, 0, 0, 0.1); color: #555; }

/* History — always visible, fixed height, internal scroll */
.tr-history {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 6px;
  flex-shrink: 0;
}
.tr-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2px 4px;
  font-size: 0.7rem;
  color: #999;
  font-weight: 600;
  height: 18px;
}
.tr-history-clear {
  border: none; background: none; cursor: pointer;
  font-size: 0.65rem; color: #ccc; font-family: inherit;
  transition: color 0.2s; padding: 0;
}
.tr-history-clear:hover { color: #e74c3c; }

.tr-history-list {
  height: 100px; /* 5 items × 34px */
  overflow-y: auto;
  scroll-behavior: smooth;
}
.tr-history-list::-webkit-scrollbar { width: 4px; }
.tr-history-list::-webkit-scrollbar-track { background: transparent; }
.tr-history-list::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 2px; }
.tr-history-list::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.2); }

.tr-history-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 5px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  height: 34px;
  box-sizing: border-box;
}
.tr-history-item:hover { background: rgba(0, 0, 0, 0.03); }

.tr-h-flags {
  font-size: 11px;
  flex-shrink: 0;
  letter-spacing: -1px;
}
.tr-h-source {
  font-size: 0.7rem;
  font-weight: 600;
  color: #444;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60px;
  flex-shrink: 0;
}
.tr-h-arrow2 {
  font-size: 0.5rem;
  color: #ccc;
  flex-shrink: 0;
}
.tr-h-target {
  flex: 1;
  min-width: 0;
  font-size: 0.68rem;
  color: #2DD4A8;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tr-history-time {
  font-size: 0.55rem;
  color: #bbb;
  flex-shrink: 0;
  white-space: nowrap;
}
.tr-history-del {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.08);
  cursor: pointer;
  font-size: 8px; color: #aaa;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.tr-history-item:hover .tr-history-del { opacity: 1; }
.tr-history-del:hover { background: rgba(231, 76, 60, 0.2); color: #e74c3c; }

.tr-history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.75rem;
  color: #d0d0d0;
  user-select: none;
}
</style>
