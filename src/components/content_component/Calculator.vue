<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const input = ref('')
const result = ref('')
const history = ref<{ expr: string; result: string }[]>([])
const inputRef = ref<HTMLInputElement>()
const keyboardVisible = ref(false)
const editingTitle = ref(false)
const title = ref('🔢 计算器')
const titleInput = ref<HTMLInputElement>()

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const historyKey = `calc-history${props.widgetId != null ? '-' + props.widgetId : ''}`

const savedHistory = localStorage.getItem(historyKey)
if (savedHistory) {
  try { history.value = JSON.parse(savedHistory) } catch { history.value = [] }
}

function saveHistory() {
  localStorage.setItem(historyKey, JSON.stringify(history.value.slice(0, 20)))
}

// Auto-calculate: = or Enter → history, edit after result → preview only
watch(input, (val) => {
  if (!val.trim()) {
    result.value = ''
  } else if (val.includes('=')) {
    const expr = val.replace(/=.*$/, '').trim()
    if (expr) {
      input.value = expr
      result.value = ''
      calculate() // adds history
    } else {
      input.value = ''
      result.value = ''
    }
  } else if (result.value && result.value !== 'Error') {
    doCalculate(val.trim()) // preview, no history
  }
})

function insertText(text: string) {
  if (result.value) { input.value = ''; result.value = '' }
  const el = inputRef.value
  if (!el) { input.value += text; return }
  const start = el.selectionStart ?? input.value.length
  const end = el.selectionEnd ?? input.value.length
  input.value = input.value.slice(0, start) + text + input.value.slice(end)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + text.length, start + text.length)
  })
}

function doCalculate(expr: string) {
  let e = expr.replace(/（/g, '(').replace(/）/g, ')')
  try {
    if (!/^[\d+\-*/().%\s]+$/.test(e)) throw new Error('Invalid')
    const res = Function('"use strict"; return (' + e + ')')()
    result.value = String(Number.isFinite(res) ? res : 'Error')
  } catch {
    result.value = 'Error'
  }
}

function calculate() {
  const expr = input.value.trim()
  if (!expr) return
  doCalculate(expr)
  // Add to history
  history.value.unshift({ expr: input.value, result: result.value })
  if (history.value.length > 20) history.value.length = 20
  saveHistory()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); calculate() }
  if (e.key === 'Escape') { input.value = ''; result.value = '' }
}

function clearInput() { input.value = ''; result.value = '' }

function restoreFromHistory(item: { expr: string; result: string }) {
  input.value = item.expr
  result.value = item.result
  keyboardVisible.value = true
  nextTick(() => inputRef.value?.focus())
}

function deleteHistory(index: number) {
  history.value.splice(index, 1)
  saveHistory()
}

function startEditTitle() { editingTitle.value = true; setTimeout(() => titleInput.value?.focus(), 50) }
function saveTitle() { editingTitle.value = false; if (!title.value.trim()) title.value = '🔢 计算器' }

// Drag
const posKey = `calc-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
const x = ref(savedPos?.x ?? props.initialX ?? 500)
const y = ref(savedPos?.y ?? props.initialY ?? 100)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))
let dragging = false, sx = 0, sy = 0, ix = 0, iy = 0
function onDragStart(e: MouseEvent) {
  dragging = true; sx = e.clientX; sy = e.clientY; ix = x.value; iy = y.value
  document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent) { if (!dragging) return; x.value = ix + (e.clientX - sx); y.value = iy + (e.clientY - sy) }
function onDragEnd() { dragging = false; document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd) }

const buttons = [
  ['C', '()', '%', '/'],
  ['7', '8', '9', '*'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
]

function onButtonClick(btn: string) {
  if (btn === 'C') { input.value = ''; result.value = '' }
  else if (btn === '⌫') { input.value = input.value.slice(0, -1) }
  else if (btn === '()') { insertText('()') }
  else if (btn === '=') { calculate() }
  else { insertText(btn) }
}

// props defined above
</script>

<template>
  <div class="calculator" :class="{ expanded: keyboardVisible }" :style="{ left: x + 'px', top: y + 'px' }">
    <div class="calc-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
      <input v-if="editingTitle" ref="titleInput" v-model="title" class="calc-title-input" @blur="saveTitle" @keyup.enter="saveTitle" @mousedown.stop />
      <span v-else class="calc-label" @dblclick="startEditTitle">{{ title }}</span>
      <button class="calc-kb-toggle" @mousedown.stop @click="keyboardVisible = !keyboardVisible" :title="keyboardVisible ? '收起键盘' : '展开键盘'">
        {{ keyboardVisible ? '▾' : '▸' }}
      </button>
    </div>

    <!-- Display -->
    <div class="calc-display" @click="inputRef?.focus()">
      <div class="calc-input" :class="{ 'has-result': result }">
        <input
          ref="inputRef"
          v-model="input"
          class="calc-input-field"
          placeholder="输入算式，按 = 计算"
          @keydown="onKeydown"
        />
        <span v-if="result" class="calc-result">= {{ result }}</span>
      </div>
    </div>

    <!-- Buttons -->
    <div v-show="keyboardVisible" class="calc-buttons">
      <button
        v-for="btn in buttons.flat()"
        :key="btn"
        class="calc-btn"
        :class="{
          'calc-btn-op': '+-*/%'.includes(btn),
          'calc-btn-eq': btn === '=',
          'calc-btn-action': btn === 'C' || btn === '⌫',
        }"
        @click="onButtonClick(btn)"
      >
        {{ btn }}
      </button>
    </div>

    <!-- History -->
    <div v-if="history.length > 0" class="calc-history">
      <div class="calc-history-header">
        <span>📋 历史</span>
        <button class="calc-history-clear" @click="history = []; saveHistory()" title="清空">清空</button>
      </div>
      <div class="calc-history-list">
        <div v-for="(h, i) in history" :key="i" class="calc-history-item" @click="restoreFromHistory(h)">
          <span class="calc-history-expr">{{ h.expr }}</span>
          <span class="calc-history-res">= {{ h.result }}</span>
          <button class="calc-history-del" @click.stop="deleteHistory(i)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calculator {
  position: absolute; width: 240px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px) saturate(1.5);
  border-radius: 14px; border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  z-index: 56; display: flex; flex-direction: column; overflow: hidden;
  transition: height 0.25s ease;
}

.calc-drag-bar {
  height: 28px; background: rgba(0,0,0,0.04);
  display: flex; align-items: center; gap: 6px;
  padding: 0 10px; cursor: grab; user-select: none;
  flex-shrink: 0; border-bottom: 1px solid rgba(0,0,0,0.05);
}
.calc-drag-bar:active { cursor: grabbing; }
.drag-dots { color: rgba(0,0,0,0.2); font-size: 14px; letter-spacing: 3px; }
.calc-label { font-size: 0.78rem; font-weight: 700; color: rgba(0,0,0,0.45); cursor: pointer; flex: 1; }
.calc-title-input { width: 100px; font-size: 0.78rem; font-weight: 700; border: 1.5px solid #2DD4A8; border-radius: 4px; padding: 1px 4px; outline: none; font-family: inherit; }
.calc-kb-toggle {
  width: 20px; height: 20px; border: none; background: rgba(0,0,0,0.06);
  border-radius: 50%; cursor: pointer; font-size: 11px; color: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.calc-kb-toggle:hover { background: rgba(0,0,0,0.12); }

/* Display */
.calc-display { padding: 14px 14px 8px; }
.calc-input { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; }
.calc-input-field {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: 1.5rem; font-weight: 600; color: #2d3436;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  padding: 4px 0; caret-color: #2DD4A8;
}
.calc-input-field::placeholder { color: #ccc; font-size: 0.8rem; }
.calc-result {
  font-size: 1.5rem; font-weight: 700;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  color: #2DD4A8; white-space: nowrap;
}

/* Buttons */
.calc-buttons {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 6px; padding: 0 14px 14px;
}
.calc-btn {
  aspect-ratio: 1.4; border: none; border-radius: 10px;
  background: rgba(0,0,0,0.04); cursor: pointer;
  font-size: 0.95rem; font-weight: 600; color: #444;
  transition: all 0.15s; display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, 'PingFang SC', sans-serif;
}
.calc-btn:hover { background: rgba(0,0,0,0.08); }
.calc-btn:active { transform: scale(0.95); background: rgba(0,0,0,0.12); }
.calc-btn-op { color: #2DD4A8; font-size: 1.1rem; }
.calc-btn-eq { background: #2DD4A8; color: #fff; font-size: 1.2rem; }
.calc-btn-eq:hover { background: #26C498; }
.calc-btn-action { color: #e74c3c; font-weight: 700; }

/* History */
.calc-history { border-top: 1px solid rgba(0,0,0,0.06); }
.calc-history-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 14px 4px; font-size: 0.7rem; color: #999; font-weight: 600;
}
.calc-history-clear {
  border: none; background: none; cursor: pointer;
  font-size: 0.65rem; color: #ccc; font-family: inherit; transition: color 0.2s;
}
.calc-history-clear:hover { color: #e74c3c; }
.calc-history-list { max-height: 102px; overflow-y: auto; padding: 0 14px 8px; }
.calc-history-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 0; cursor: pointer; border-radius: 4px;
  transition: background 0.15s; font-size: 0.72rem;
  font-family: 'SF Mono', 'Consolas', monospace;
}
.calc-history-item:hover { background: rgba(0,0,0,0.03); }
.calc-history-expr { color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.calc-history-res { color: #2DD4A8; font-weight: 600; flex-shrink: 0; }
.calc-history-del {
  margin-left: auto; width: 16px; height: 16px; border-radius: 50%;
  border: none; background: rgba(0,0,0,0.08); cursor: pointer;
  font-size: 8px; color: #aaa; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s; flex-shrink: 0;
}
.calc-history-item:hover .calc-history-del { opacity: 1; }
</style>
