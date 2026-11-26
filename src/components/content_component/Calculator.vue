<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

import { removeItem } from '../../storage'
const input = ref('')
const result = ref('')
const inputRef = ref<HTMLInputElement>()
const keyboardVisible = ref(true)
const title = ref('🔢 计算器')
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const legacyHistoryKey = `calc-history${props.widgetId != null ? '-' + props.widgetId : ''}`
removeItem(legacyHistoryKey)

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
    result.value = String(
      Number.isFinite(res)
        ? Number.parseFloat(Number(res).toPrecision(12))
        : 'Error',
    )
  } catch {
    result.value = 'Error'
  }
}

function calculate() {
  const expr = input.value.trim()
  if (!expr) return
  doCalculate(expr)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); calculate() }
  if (e.key === 'Escape') { input.value = ''; result.value = '' }
}

async function copyResult() {
  if (!result.value || result.value === 'Error') return
  try {
    await navigator.clipboard.writeText(result.value)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 1400)
  } catch {
    copied.value = false
  }
}

// Drag
const posKey = `calc-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 500, 100)

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
onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <div class="calculator widget-card" :class="{ expanded: keyboardVisible }" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="header" :on-drag-start="onDragStart" v-model:title="title" :editable="true" title-placeholder="🔢 计算器">
      <button class="calc-kb-toggle" @click="keyboardVisible = !keyboardVisible" :title="keyboardVisible ? '收起键盘' : '展开键盘'">
        {{ keyboardVisible ? '▾' : '▸' }}
      </button>
    </DragBar>

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
        <span v-if="result" class="calc-result" role="status" aria-live="polite">= {{ result }}</span>
        <button
          v-if="result && result !== 'Error'"
          type="button"
          class="calc-copy"
          :title="copied ? '已复制' : '复制结果'"
          :aria-label="copied ? '已复制结果' : '复制结果'"
          @click.stop="copyResult"
        >
          {{ copied ? '✓' : '复制' }}
        </button>
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

  </div>
</template>

<style scoped>
.calculator {
  position: absolute; width: 240px;
  z-index: 56; display: flex; flex-direction: column;
  transition: height 0.25s ease;
}

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
  font-size: 1.5rem; font-weight: 600; color: var(--color-ink);
  font-family: var(--font-mono);
  padding: 4px 0; caret-color: var(--color-primary);
}
.calc-input-field::placeholder { color: var(--color-ink-3); font-size: 0.8rem; }
.calc-result {
  font-size: 1.5rem; font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-primary); white-space: nowrap;
}
.calc-copy {
  min-width: 30px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--color-border) 76%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 58%, transparent);
  color: var(--color-ink-3);
  cursor: pointer;
  font: 650 0.56rem/1 var(--font-family);
}
.calc-copy:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* Buttons */
.calc-buttons {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 6px; padding: 0 14px 14px;
}
.calc-btn {
  aspect-ratio: 1.4; border: none; border-radius: var(--radius-sm);
  background: rgba(0,0,0,0.04); cursor: pointer;
  font-size: 0.95rem; font-weight: 600; color: var(--color-ink);
  transition: all 0.15s; display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, 'PingFang SC', sans-serif;
}
.calc-btn:hover { background: rgba(0,0,0,0.08); }
.calc-btn:active { transform: scale(0.95); background: rgba(0,0,0,0.12); }
.calc-btn-op { color: var(--color-primary); font-size: 1.1rem; }
.calc-btn-eq { background: var(--color-primary); color: #fff; font-size: 1.2rem; }
.calc-btn-eq:hover { background: var(--color-primary-hover); }
.calc-btn-action { color: var(--color-danger); font-weight: 700; }

/* === Dark mode === */
html.dark .calc-kb-toggle { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
html.dark .calc-kb-toggle:hover { background: rgba(255,255,255,0.16); }
html.dark .calc-btn { background: rgba(255,255,255,0.08); }
html.dark .calc-btn:hover { background: rgba(255,255,255,0.13); }
html.dark .calc-btn:active { background: rgba(255,255,255,0.18); }
</style>
