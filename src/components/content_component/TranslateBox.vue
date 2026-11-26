<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

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

const inputText = ref('')
const outputText = ref('')
const translating = ref(false)
const inputRef = ref<HTMLTextAreaElement>()
const clipboardHint = ref('')
const outputProvider = ref('')
const copyHint = ref('')
let copyHintTimer: ReturnType<typeof setTimeout> | null = null

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
  outputProvider.value = ''
  const [from, to] = direction.value === 'zh2en' ? ['zh-CN', 'en'] : ['en', 'zh-CN']

  try {
    const translation = await requestTranslation(text, from, to)
    outputText.value = translation.text
    outputProvider.value = translation.provider
  } catch {
    outputText.value = '网络错误，请重试'
    outputProvider.value = ''
  } finally {
    translating.value = false
  }
}

async function requestTranslation(
  text: string,
  from: string,
  to: string,
): Promise<{ text: string; provider: string }> {
  const mozhiUrl = new URL('https://mozhi.aryak.me/api/translate')
  mozhiUrl.searchParams.set('engine', 'google')
  mozhiUrl.searchParams.set('from', from)
  mozhiUrl.searchParams.set('to', to)
  mozhiUrl.searchParams.set('text', text)

  try {
    const response = await fetch(mozhiUrl)
    if (response.ok) {
      const payload = await response.json() as { 'translated-text'?: string }
      if (payload['translated-text']) {
        return { text: payload['translated-text'], provider: 'Mozhi · Google' }
      }
    }
  } catch {
    // Try the secondary no-key endpoint below.
  }

  const fallbackUrl = new URL('https://api.mymemory.translated.net/get')
  fallbackUrl.searchParams.set('q', text)
  fallbackUrl.searchParams.set('langpair', `${from}|${to}`)
  const response = await fetch(fallbackUrl)
  if (!response.ok) throw new Error('Translation service unavailable')
  const payload = await response.json() as { responseData?: { translatedText?: string } }
  const result = payload.responseData?.translatedText
  if (!result) throw new Error('Translation response is empty')
  return { text: result, provider: 'MyMemory' }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    translate()
  }
}

function swapLanguages() {
  if (!outputText.value) return
  inputText.value = outputText.value
  outputText.value = ''
  outputProvider.value = ''
  direction.value = direction.value === 'zh2en' ? 'en2zh' : 'zh2en'
  nextTick(() => inputRef.value?.focus())
}

async function fillFromClipboard() {
  if (inputText.value.trim()) return
  try {
    const text = (await navigator.clipboard.readText()).trim()
    if (!text) return
    inputText.value = text.slice(0, 500)
    clipboardHint.value = '已从剪贴板填入'
    onInput()
    window.setTimeout(() => {
      clipboardHint.value = ''
    }, 1800)
  } catch {
    // Clipboard access may require a browser permission; the input stays editable.
  }
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(outputText.value)
    copyHint.value = '已复制译文'
    if (copyHintTimer) clearTimeout(copyHintTimer)
    copyHintTimer = setTimeout(() => { copyHint.value = '' }, 1600)
  } catch {
    copyHint.value = '复制失败'
  }
}

// Title
const savedTitle = JSON.parse(localStorage.getItem(`${tk}-title`) || 'null')
const title = ref(savedTitle ?? '🌐 翻译')
watch(title, (v) => localStorage.setItem(`${tk}-title`, JSON.stringify(v)))

// Drag
const posKey = `translate-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 520, 200, false)

onBeforeUnmount(() => {
  if (detectTimer) clearTimeout(detectTimer)
  if (copyHintTimer) clearTimeout(copyHintTimer)
})
</script>

<template>
  <div class="translate-box widget-card" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <DragBar variant="header" :on-drag-start="onDragStart" v-model:title="title" :editable="true" title-placeholder="🌐 翻译">
      <span class="tr-auto-badge">自动检测</span>
    </DragBar>

    <!-- Body — fixed layout -->
    <div class="tr-body">
      <!-- Direction and action stay on one row -->
      <div class="tr-toolbar">
        <div class="tr-langs">
          <button class="tr-lang-btn" :class="{ active: direction === 'zh2en' }" @click="direction = 'zh2en'">
            中文 → English
          </button>
          <button class="tr-lang-btn" :class="{ active: direction === 'en2zh' }" @click="direction = 'en2zh'">
            English → 中文
          </button>
        </div>
        <button class="tr-swap-btn" @click="swapLanguages" :disabled="!outputText" title="交换语言">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7h10l-3-3M17 17H7l3 3" />
          </svg>
        </button>
        <button class="tr-btn" @click="translate" :disabled="!inputText.trim() || translating">
          <span v-if="translating" class="tr-spinner"></span>
          <span v-else>翻译</span>
        </button>
      </div>
      <div class="tr-privacy-note">
        翻译内容会发送至第三方服务，请勿输入敏感信息
      </div>

      <!-- Input -->
      <div class="tr-input-area field-shell">
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="tr-textarea"
          :placeholder="direction === 'zh2en' ? '输入中文...' : 'Enter English...'"
          maxlength="500"
          @input="onInput"
          @keydown="onKeydown"
        ></textarea>
        <button type="button" class="tr-paste-btn" title="从剪贴板粘贴" @click="fillFromClipboard">
          从剪贴板
        </button>
        <span class="tr-char-count">{{ inputText.length }}/500</span>
        <span v-if="clipboardHint" class="tr-clipboard-hint">{{ clipboardHint }}</span>
      </div>

      <!-- Output -->
      <div class="tr-output-area" :class="{ empty: !outputText, error: outputText === '网络错误，请重试' || outputText === '翻译失败' }">
        <button v-if="outputText" class="tr-copy-btn" @click="copyOutput" title="复制译文">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <div v-if="outputText" class="tr-output-text">{{ outputText }}</div>
        <div v-else class="tr-output-placeholder">译文将显示在这里...</div>
        <span v-if="outputProvider" class="tr-provider">{{ outputProvider }}</span>
        <span class="tr-copy-status" role="status" aria-live="polite">{{ copyHint }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.translate-box {
  position: absolute;
  width: 320px;
  z-index: 56;
  display: flex;
  flex-direction: column;
}

.tr-auto-badge {
  margin-left: auto;
  font-size: 0.55rem; font-weight: 700; color: var(--color-primary);
  background: var(--color-primary-soft);
  padding: 2px 6px; border-radius: 6px; white-space: nowrap;
}

/* Body — no gap growth */
.tr-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

/* Direction and translation action */
.tr-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.tr-langs {
  min-width: 0;
  flex: 1;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.tr-lang-btn {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 5px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--color-surface-soft) 72%, transparent);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
  font-family: inherit;
  font-size: 0.64rem;
  font-weight: 600;
  color: var(--color-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tr-lang-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-border);
}
.tr-lang-btn.active {
  background: var(--color-primary-soft);
  border-color: color-mix(in srgb, var(--color-primary) 44%, transparent);
  color: var(--color-ink);
}
.tr-privacy-note {
  margin-top: -5px;
  color: var(--color-ink-3);
  font-size: 0.56rem;
  line-height: 1.35;
}

/* Input area */
.tr-input-area {
  position: relative;
  background: var(--color-surface-soft);
  border-radius: 10px;
  padding: 10px 10px 16px;
  border: 1px solid var(--color-border);
  transition: border-color 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.tr-input-area:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border));
  box-shadow: var(--focus-ring);
  background: var(--color-surface);
}
.tr-char-count {
  position: absolute;
  right: 9px;
  bottom: 3px;
  font-size: 0.6rem;
  color: var(--color-ink-3);
}
.tr-textarea {
  width: 100%;
  height: 58px;
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--color-ink);
  font-family: var(--font-family);
  line-height: 1.45;
  padding: 0 70px 0 0;
}
.tr-textarea::placeholder { color: var(--color-ink-3); font-weight: 400; }
.tr-clipboard-hint {
  position: absolute;
  left: 10px;
  bottom: 3px;
  color: color-mix(in srgb, var(--color-primary) 64%, var(--color-ink-2));
  font-size: 0.58rem;
}
.tr-paste-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  min-height: 24px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 68%, transparent);
  color: var(--color-ink-3);
  cursor: pointer;
  font: 650 0.56rem/1 var(--font-family);
}
.tr-paste-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }

.tr-swap-btn {
  width: 28px; height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  color: var(--color-ink-2);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.tr-swap-btn:hover:not(:disabled) { background: var(--color-surface); color: var(--color-ink); }
.tr-swap-btn:disabled { opacity: 0.3; cursor: default; }
.tr-swap-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tr-btn {
  height: 32px;
  padding: 0 13px;
  border-radius: 8px;
  border: none;
  background: var(--color-ink);
  color: var(--color-surface);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: inherit;
  transition: all 0.2s;
  min-width: 54px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.tr-btn:hover:not(:disabled) { background: var(--color-primary); color: #12382f; }
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

/* Output */
.tr-output-area {
  position: relative;
  background: color-mix(in srgb, var(--color-primary) 4%, transparent);
  border-radius: 10px;
  padding: 10px 30px 20px 10px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 12%, transparent);
  flex-shrink: 0;
  height: 68px;
  overflow-y: auto;
}
.tr-output-area.empty {
  background: transparent;
  border-color: var(--color-border);
}
.tr-output-area.error {
  background: color-mix(in srgb, var(--color-danger) 4%, transparent);
  border-color: color-mix(in srgb, var(--color-danger) 15%, transparent);
}
.tr-output-area.error .tr-output-text {
  color: var(--color-danger);
}
.tr-output-text {
  font-size: 0.88rem;
  color: var(--color-ink);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.tr-output-placeholder {
  font-size: 0.82rem;
  color: var(--color-ink-3);
  line-height: 1.45;
  font-style: italic;
}
.tr-copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px; height: 22px;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 5px;
  cursor: pointer;
  color: var(--color-ink-3);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.tr-copy-btn svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tr-copy-btn:hover { background: rgba(0, 0, 0, 0.1); color: var(--color-ink); }
.tr-provider,
.tr-copy-status {
  position: absolute;
  bottom: 3px;
  color: var(--color-ink-3);
  font-size: 0.52rem;
}
.tr-provider { left: 10px; }
.tr-copy-status { right: 9px; color: var(--color-primary-hover); }
html.dark .tr-copy-btn { background: rgba(255, 255, 255, 0.08); }
html.dark .tr-copy-btn:hover { background: rgba(255, 255, 255, 0.14); }

</style>
