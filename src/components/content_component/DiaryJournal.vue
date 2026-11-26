<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { deleteDiaryEntry, getDiaryEntries, getDiaryEntry, saveDiaryEntry } from '../../db'
import { getItem, setItem } from '../../storage'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import type { DiaryEntry } from '../../types'
import { todayStr } from '../../utils/date'
import DragBar from '../common/DragBar.vue'
import UiDialog from '../common/UiDialog.vue'

interface MoodOption {
  key: string
  emoji: string
  label: string
  tone: string
}

const MOODS: MoodOption[] = [
  { key: 'joyful', emoji: '😄', label: '开心', tone: '#f4b942' },
  { key: 'good', emoji: '🙂', label: '不错', tone: '#4fb477' },
  { key: 'calm', emoji: '😌', label: '平静', tone: '#5aa9a1' },
  { key: 'tired', emoji: '😴', label: '疲惫', tone: '#7c8aa5' },
  { key: 'low', emoji: '😔', label: '低落', tone: '#6887ad' },
  { key: 'stressed', emoji: '😤', label: '烦躁', tone: '#d97757' },
]

const PROMPTS = [
  '今天有什么小事，值得以后重新读一遍？',
  '此刻最真实的感觉是什么？',
  '写下一个让你停下来的瞬间。',
  '今天学到了什么，或放下了什么？',
  '如果只留下一句话，你想写哪一句？',
  '最近反复出现在脑海里的，是什么？',
  '今天谁或什么事，让你感到被理解？',
]

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const widgetId = props.widgetId ?? 0
const widgetKey = props.widgetId != null ? `-${props.widgetId}` : ''
const posKey = `diary-pos${widgetKey}`
const widgetTitleKey = `diary-title${widgetKey}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 440, 180)

function readWidgetTitle() {
  try {
    return JSON.parse(getItem(widgetTitleKey) || 'null') || '📔 日记'
  } catch {
    return '📔 日记'
  }
}

const widgetTitle = ref(readWidgetTitle())
watch(widgetTitle, value => setItem(widgetTitleKey, JSON.stringify(value)))

const entries = ref<DiaryEntry[]>([])
const selectedDate = ref(todayStr())
const entryTitle = ref('')
const entryContent = ref('')
const entryMood = ref('')
const entryTagsInput = ref('')
const currentEntryId = ref<number>()
const saveState = ref<'saved' | 'saving' | 'dirty'>('saved')
const historyOpen = ref(false)
const historySearch = ref('')
const privacyMode = ref(true)
const diaryRootRef = ref<HTMLElement>()
const dateInputRef = ref<HTMLInputElement>()
const privacyShieldRef = ref<HTMLButtonElement>()
const calendarCursor = ref(startOfMonth(parseDateKey(selectedDate.value)))
const privacyIdleMs = 2 * 60 * 1000
const displayedWidgetTitle = computed({
  get: () => privacyMode.value ? '🔒 私密内容' : widgetTitle.value,
  set: (value: string) => {
    if (!privacyMode.value) widgetTitle.value = value
  },
})

let ignoreAutosave = true
let saveTimer: number | undefined
let privacyIdleTimer: number | undefined
let editVersion = 0
let loadToken = 0
let saveChain: Promise<void> = Promise.resolve()

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftDate(value: string, days: number) {
  const date = parseDateKey(value)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

const selectedDateObject = computed(() => parseDateKey(selectedDate.value))
const selectedYear = computed(() => selectedDateObject.value.getFullYear())
const selectedMonth = computed(() => selectedDateObject.value.getMonth() + 1)
const selectedDay = computed(() => selectedDateObject.value.getDate())
const selectedWeekday = computed(() => (
  ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][selectedDateObject.value.getDay()]
))
const selectedMonthLabel = computed(() => `${selectedYear.value} 年 ${selectedMonth.value} 月`)
const isTodaySelected = computed(() => selectedDate.value === todayStr())
const dailyPrompt = computed(() => {
  const seed = [...selectedDate.value].reduce((total, char) => total + char.charCodeAt(0), 0)
  return PROMPTS[seed % PROMPTS.length]
})

const parsedTags = computed(() => (
  entryTagsInput.value
    .split(/[,，]/)
    .map(tag => tag.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .slice(0, 8)
))

const characterCount = computed(() => entryContent.value.replace(/\s/g, '').length)
const selectedMood = computed(() => MOODS.find(mood => mood.key === entryMood.value))
const savedDates = computed(() => new Set(entries.value.map(entry => entry.date)))

const streak = computed(() => {
  let cursor = parseDateKey(todayStr())
  if (!savedDates.value.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let total = 0
  while (savedDates.value.has(dateKey(cursor))) {
    total++
    cursor.setDate(cursor.getDate() - 1)
  }
  return total
})

const throwback = computed(() => {
  const month = String(selectedMonth.value).padStart(2, '0')
  const day = String(selectedDay.value).padStart(2, '0')
  return entries.value
    .filter(entry => (
      entry.date.slice(5) === `${month}-${day}`
      && Number(entry.date.slice(0, 4)) < selectedYear.value
    ))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
})

const calendarMonthLabel = computed(() => (
  `${calendarCursor.value.getFullYear()} 年 ${calendarCursor.value.getMonth() + 1} 月`
))

const calendarDays = computed(() => {
  const year = calendarCursor.value.getFullYear()
  const month = calendarCursor.value.getMonth()
  const first = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const key = dateKey(date)
    return {
      date: key,
      day: date.getDate(),
      currentMonth: date.getMonth() === month,
      hasEntry: savedDates.value.has(key),
      isToday: key === todayStr(),
      isSelected: key === selectedDate.value,
      future: key > todayStr(),
    }
  })
})

const filteredEntries = computed(() => {
  const query = historySearch.value.trim().toLocaleLowerCase()
  if (!query) return entries.value
  return entries.value.filter(entry => (
    entry.title.toLocaleLowerCase().includes(query)
    || entry.content.toLocaleLowerCase().includes(query)
    || entry.tags.some(tag => tag.toLocaleLowerCase().includes(query))
    || moodMeta(entry.mood).label.includes(query)
  ))
})

function moodMeta(key: string) {
  return MOODS.find(mood => mood.key === key) || { key: '', emoji: '·', label: '', tone: '#9ca3af' }
}

function entryPreview(entry: DiaryEntry) {
  const value = entry.content.replace(/\s+/g, ' ').trim()
  return value || entry.title || '这一天没有留下正文'
}

function formatEntryDate(value: string) {
  const date = parseDateKey(value)
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: `${date.getMonth() + 1} 月`,
    weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
  }
}

async function loadAllEntries() {
  entries.value = await getDiaryEntries(widgetId)
  entries.value.sort((a, b) => (
    b.date.localeCompare(a.date)
    || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ))
}

async function loadDate(value: string) {
  const token = ++loadToken
  ignoreAutosave = true
  const stored = await getDiaryEntry(widgetId, value)
  if (token !== loadToken || selectedDate.value !== value) return

  currentEntryId.value = stored?.id
  entryTitle.value = stored?.title || ''
  entryContent.value = stored?.content || ''
  entryMood.value = stored?.mood || ''
  entryTagsInput.value = stored?.tags?.join(', ') || ''
  dirty = false
  saveState.value = 'saved'
  await nextTick()
  if (token === loadToken) ignoreAutosave = false
}

let dirty = false

function scheduleSave() {
  if (ignoreAutosave) return
  dirty = true
  editVersion++
  saveState.value = 'dirty'
  if (saveTimer != null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveChain = saveChain.then(persistCurrentEntry)
  }, 450)
}

watch(
  [entryTitle, entryContent, entryMood, entryTagsInput],
  scheduleSave,
  { flush: 'post' },
)

watch(selectedDate, value => {
  void loadDate(value)
}, { immediate: true })

watch(historyOpen, open => {
  if (!open) return
  calendarCursor.value = startOfMonth(selectedDateObject.value)
})
watch(historyOpen, (open) => {
  if (open) clearPrivacyIdleTimer()
  else schedulePrivacyIdleTimer()
})

async function persistCurrentEntry() {
  if (ignoreAutosave || !dirty) return
  const version = editVersion
  const snapshot = {
    date: selectedDate.value,
    title: entryTitle.value.trim(),
    content: entryContent.value,
    mood: entryMood.value,
    tags: parsedTags.value,
  }
  dirty = false
  saveState.value = 'saving'
  const hasValue = Boolean(snapshot.title || snapshot.content.trim() || snapshot.mood || snapshot.tags.length)
  if (!hasValue) {
    if (currentEntryId.value != null) await deleteDiaryEntry(currentEntryId.value)
    if (selectedDate.value === snapshot.date) currentEntryId.value = undefined
  } else {
    const id = await saveDiaryEntry(undefined, {
      widgetId,
      ...snapshot,
    })
    if (selectedDate.value === snapshot.date) currentEntryId.value = id
  }

  await loadAllEntries()
  if (editVersion === version) saveState.value = 'saved'
}

function flushSave() {
  if (saveTimer != null) {
    window.clearTimeout(saveTimer)
    saveTimer = undefined
  }
  saveChain = saveChain.then(persistCurrentEntry)
  return saveChain
}

async function selectDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > todayStr()) return
  await flushSave()
  if (value === selectedDate.value) return
  selectedDate.value = value
}

function shiftSelectedDate(days: number) {
  const next = shiftDate(selectedDate.value, days)
  void selectDate(next)
}

function openDatePicker() {
  const input = dateInputRef.value
  if (!input) return
  const pickerInput = input as HTMLInputElement & { showPicker?: () => void }
  if (typeof pickerInput.showPicker === 'function') pickerInput.showPicker()
  else input.click()
}

function onDateInput(event: Event) {
  void selectDate((event.target as HTMLInputElement).value)
}

function selectMood(key: string) {
  entryMood.value = entryMood.value === key ? '' : key
}

function clearPrivacyIdleTimer() {
  if (privacyIdleTimer != null) {
    window.clearTimeout(privacyIdleTimer)
    privacyIdleTimer = undefined
  }
}

function schedulePrivacyIdleTimer() {
  clearPrivacyIdleTimer()
  if (privacyMode.value || historyOpen.value) return
  privacyIdleTimer = window.setTimeout(() => {
    hideDiary({ focus: false })
  }, privacyIdleMs)
}

function notePrivacyActivity() {
  if (!privacyMode.value) schedulePrivacyIdleTimer()
}

function revealDiary() {
  privacyMode.value = false
  void nextTick(schedulePrivacyIdleTimer)
}

function hideDiary(options: { focus?: boolean } = {}) {
  clearPrivacyIdleTimer()
  privacyMode.value = true
  historyOpen.value = false
  if (options.focus !== false) {
    void nextTick(() => privacyShieldRef.value?.focus())
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') hideDiary({ focus: false })
}

function handleWindowBlur() {
  hideDiary({ focus: false })
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (privacyMode.value || historyOpen.value) return
  const target = event.target
  if (target instanceof Node && diaryRootRef.value?.contains(target)) return
  hideDiary({ focus: false })
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || privacyMode.value || historyOpen.value) return
  hideDiary()
}

function openLibrary() {
  void flushSave()
  historyOpen.value = true
}

async function openEntry(value: string) {
  await selectDate(value)
  historyOpen.value = false
}

function goCalendarMonth(offset: number) {
  const year = calendarCursor.value.getFullYear()
  const month = calendarCursor.value.getMonth() + offset
  calendarCursor.value = new Date(year, month, 1)
}

function selectCalendarDate(value: string) {
  if (value > todayStr()) return
  void openEntry(value)
}

async function deleteCurrentEntry() {
  if (!currentEntryId.value && !entryTitle.value && !entryContent.value && !entryMood.value && !entryTagsInput.value) {
    return
  }
  if (!window.confirm('删除这一天的日记？此操作不可恢复。')) return
  if (currentEntryId.value != null) await deleteDiaryEntry(currentEntryId.value)
  ignoreAutosave = true
  currentEntryId.value = undefined
  entryTitle.value = ''
  entryContent.value = ''
  entryMood.value = ''
  entryTagsInput.value = ''
  dirty = false
  saveState.value = 'saved'
  await nextTick()
  ignoreAutosave = false
  await loadAllEntries()
}

function exportMarkdown() {
  const sorted = [...entries.value].sort((a, b) => a.date.localeCompare(b.date))
  const markdown = sorted.map((entry) => {
    const mood = moodMeta(entry.mood)
    const tags = entry.tags.map(tag => `#${tag}`).join(' ')
    return [
      `# ${entry.date}${mood.label ? ` · ${mood.emoji} ${mood.label}` : ''}`,
      entry.title ? `## ${entry.title}` : '',
      entry.content.trim(),
      tags,
    ].filter(Boolean).join('\n\n')
  }).join('\n\n---\n\n')

  const blob = new Blob([markdown || '# 页巢日记\n\n还没有日记。'], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `页巢日记-${todayStr()}.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  void loadAllEntries()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('blur', handleWindowBlur)
})

onBeforeUnmount(() => {
  if (saveTimer != null) window.clearTimeout(saveTimer)
  clearPrivacyIdleTimer()
  void flushSave()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  document.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('blur', handleWindowBlur)
})
</script>

<template>
  <div
    ref="diaryRootRef"
    class="diary-widget widget-card"
    :style="{ left: x + 'px', top: y + 'px' }"
    @pointerdown="notePrivacyActivity"
    @keydown="notePrivacyActivity"
  >
    <DragBar
      variant="header"
      :on-drag-start="onDragStart"
      v-model:title="displayedWidgetTitle"
      :editable="!privacyMode"
      :title-placeholder="privacyMode ? '🔒 私密内容' : '📔 日记'"
    >
      <span v-if="!privacyMode && streak" class="diary-streak">{{ streak }} 天</span>
      <button
        v-if="!privacyMode"
        type="button"
        class="diary-privacy-button"
        aria-label="立即进入隐私模式"
        title="立即隐藏日记"
        @click="hideDiary()"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3.5" y="7" width="9" height="7" rx="2" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      </button>
      <button
        v-if="!privacyMode"
        type="button"
        class="diary-library-button"
        aria-label="打开日记本"
        title="浏览全部日记"
        @click="openLibrary"
      >
        册
      </button>
    </DragBar>

    <div class="diary-body">
      <div
        class="diary-private-content"
        :inert="privacyMode"
        :aria-hidden="privacyMode ? 'true' : undefined"
      >
      <div class="diary-date-row">
        <button type="button" class="diary-arrow" aria-label="前一天" @click="shiftSelectedDate(-1)">‹</button>
        <button type="button" class="diary-date-main" @click="openDatePicker">
          <span class="diary-day">{{ String(selectedDay).padStart(2, '0') }}</span>
          <span class="diary-date-copy">
            <strong>{{ selectedMonthLabel }}</strong>
            <small>{{ selectedWeekday }} · {{ isTodaySelected ? '今天' : '回看' }}</small>
          </span>
        </button>
        <button
          type="button"
          class="diary-arrow"
          aria-label="后一天"
          :disabled="isTodaySelected"
          @click="shiftSelectedDate(1)"
        >›</button>
        <input
          ref="dateInputRef"
          class="diary-date-input"
          type="date"
          :value="selectedDate"
          :max="todayStr()"
          tabindex="-1"
          aria-hidden="true"
          @change="onDateInput"
        />
      </div>

      <div class="diary-moods" role="group" aria-label="当天心情">
        <button
          v-for="mood in MOODS"
          :key="mood.key"
          type="button"
          class="diary-mood"
          :class="{ selected: entryMood === mood.key }"
          :style="{ '--mood-tone': mood.tone }"
          :aria-label="mood.label"
          :aria-pressed="entryMood === mood.key"
          :title="mood.label"
          @click="selectMood(mood.key)"
        >{{ mood.emoji }}</button>
        <span v-if="selectedMood" class="diary-mood-label">{{ selectedMood.label }}</span>
      </div>

      <button v-if="throwback" type="button" class="diary-throwback" @click="selectDate(throwback.date)">
        <span>往年今日 · {{ throwback.date.slice(0, 4) }}</span>
        <strong>{{ throwback.title || entryPreview(throwback) }}</strong>
      </button>

      <div class="diary-sheet">
        <input
          v-model="entryTitle"
          class="diary-title-input"
          maxlength="80"
          placeholder="给今天起个标题"
          aria-label="日记标题"
          @blur="flushSave"
        />
        <textarea
          v-model="entryContent"
          class="diary-content-input"
          :placeholder="dailyPrompt"
          aria-label="日记正文"
          @blur="flushSave"
        />
      </div>

      <label class="diary-tags">
        <span>#</span>
        <input
          v-model="entryTagsInput"
          maxlength="140"
          placeholder="标签，用逗号分隔"
          aria-label="日记标签"
          @blur="flushSave"
        />
        <span class="diary-save-state" aria-live="polite">
          {{ saveState === 'saving' ? '保存中' : saveState === 'dirty' ? '待保存' : '已保存' }}
        </span>
      </label>

      <footer class="diary-footer">
        <span>{{ characterCount }} 字 · {{ entries.length }} 篇</span>
        <button
          v-if="currentEntryId"
          type="button"
          class="diary-delete"
          title="删除当天日记"
          aria-label="删除当天日记"
          @click="deleteCurrentEntry"
        >删除</button>
        <button v-if="!isTodaySelected" type="button" class="diary-today" @click="selectDate(todayStr())">回到今天</button>
      </footer>
      </div>

      <button
        v-if="privacyMode"
        ref="privacyShieldRef"
        type="button"
        class="diary-privacy-shield"
        aria-label="私密内容已隐藏，点击显示"
        @click="revealDiary"
      >
        <span class="diary-privacy-lock" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <rect x="4" y="9" width="12" height="8" rx="2.5" />
            <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
          </svg>
        </span>
      </button>
    </div>
  </div>

  <UiDialog v-model="historyOpen" title="我的日记本" width="840px" :close-on-click-modal="false">
    <div class="journal-library">
      <aside class="journal-library-aside">
        <div class="journal-stats">
          <div><strong>{{ entries.length }}</strong><span>篇记录</span></div>
          <div><strong>{{ streak }}</strong><span>连续天数</span></div>
        </div>

        <div class="journal-calendar-head">
          <button type="button" :aria-label="'上个月'" @click="goCalendarMonth(-1)">‹</button>
          <strong>{{ calendarMonthLabel }}</strong>
          <button type="button" :aria-label="'下个月'" @click="goCalendarMonth(1)">›</button>
        </div>
        <div class="journal-weekdays" aria-hidden="true">
          <span v-for="day in ['日', '一', '二', '三', '四', '五', '六']" :key="day">{{ day }}</span>
        </div>
        <div class="journal-calendar-grid">
          <button
            v-for="day in calendarDays"
            :key="day.date"
            type="button"
            :class="{
              muted: !day.currentMonth,
              today: day.isToday,
              selected: day.isSelected,
              written: day.hasEntry,
            }"
            :disabled="day.future"
            :aria-label="day.date"
            @click="selectCalendarDate(day.date)"
          >
            {{ day.day }}
            <i v-if="day.hasEntry" aria-hidden="true" />
          </button>
        </div>

        <button type="button" class="journal-export" @click="exportMarkdown">
          导出 Markdown
        </button>
        <p class="journal-privacy">仅保存在当前浏览器 · 已包含在页巢备份中</p>
      </aside>

      <section class="journal-library-main">
        <label class="journal-search">
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="7.5" cy="7.5" r="4.8" />
            <path d="m11.2 11.2 3.6 3.6" />
          </svg>
          <input v-model="historySearch" placeholder="搜索标题、正文、标签或心情" aria-label="搜索日记" />
          <button v-if="historySearch" type="button" aria-label="清除搜索" @click="historySearch = ''">×</button>
        </label>

        <div class="journal-entry-list">
          <button
            v-for="entry in filteredEntries"
            :key="entry.id"
            type="button"
            class="journal-entry-row"
            @click="openEntry(entry.date)"
          >
            <time :datetime="entry.date">
              <strong>{{ formatEntryDate(entry.date).day }}</strong>
              <span>{{ formatEntryDate(entry.date).month }}</span>
            </time>
            <span class="journal-entry-copy">
              <span class="journal-entry-topline">
                <strong>{{ entry.title || '无题日记' }}</strong>
                <em>{{ moodMeta(entry.mood).emoji }} {{ moodMeta(entry.mood).label }}</em>
              </span>
              <span class="journal-entry-preview">{{ entryPreview(entry) }}</span>
              <span v-if="entry.tags.length" class="journal-entry-tags">
                <i v-for="tag in entry.tags" :key="tag">#{{ tag }}</i>
              </span>
            </span>
            <span class="journal-entry-weekday">{{ formatEntryDate(entry.date).weekday }}</span>
          </button>

          <div v-if="filteredEntries.length === 0" class="journal-empty">
            <span>✎</span>
            <strong>{{ historySearch ? '没有找到匹配的日记' : '你的第一篇日记还在等你' }}</strong>
            <p>{{ historySearch ? '换一个关键词试试。' : '关掉这里，从今天的一两句话开始。' }}</p>
          </div>
        </div>
      </section>
    </div>
  </UiDialog>
</template>

<style scoped>
.diary-widget {
  --diary-paper: color-mix(in srgb, #fffaf0 68%, transparent);
  --diary-rule: rgba(116, 93, 64, 0.13);
  position: absolute;
  width: 340px;
  height: 416px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  display: flex;
  flex-direction: column;
  z-index: 56;
}

.diary-streak {
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary-hover);
  font-size: 0.54rem;
  font-weight: 760;
  white-space: nowrap;
}

.diary-library-button {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--color-ink) 10%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 58%, transparent);
  color: var(--color-ink-2);
  cursor: pointer;
  font: 720 0.58rem/1 var(--font-family);
}
.diary-library-button:hover {
  border-color: color-mix(in srgb, var(--color-primary) 46%, var(--color-border));
  color: var(--color-primary);
}
.diary-privacy-button {
  width: 24px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--color-ink) 10%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 58%, transparent);
  color: var(--color-ink-2);
  cursor: pointer;
}
.diary-privacy-button:hover {
  border-color: color-mix(in srgb, var(--color-primary) 46%, var(--color-border));
  color: var(--color-primary);
}
.diary-privacy-button svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.45;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.diary-body {
  position: relative;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px 11px 8px;
  background:
    linear-gradient(155deg, rgba(255, 255, 255, 0.28), transparent 45%),
    var(--diary-paper);
}
.diary-private-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.diary-privacy-shield {
  position: absolute;
  z-index: 5;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  border: 0;
  background:
    radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--color-primary) 7%, transparent), transparent 44%),
    var(--color-surface);
  color: var(--color-ink-2);
  cursor: pointer;
  font-family: var(--font-family);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.diary-privacy-shield:hover {
  background:
    radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--color-primary) 11%, transparent), transparent 46%),
    var(--color-surface);
}
.diary-privacy-shield:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 34%, transparent);
}
.diary-privacy-lock {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
  color: var(--color-primary-hover);
}
.diary-privacy-lock svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.45;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.diary-date-row {
  position: relative;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.diary-arrow {
  width: 24px;
  height: 34px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font: 300 1.35rem/1 Georgia, serif;
}
.diary-arrow:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-ink) 5%, transparent);
  color: var(--color-ink);
}
.diary-arrow:disabled { opacity: 0.24; cursor: default; }
.diary-date-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 3px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.diary-day {
  min-width: 49px;
  color: var(--color-ink);
  font: 400 2.25rem/0.9 Georgia, 'Times New Roman', serif;
  letter-spacing: -0.06em;
}
.diary-date-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.diary-date-copy strong {
  color: var(--color-ink-2);
  font-size: 0.63rem;
  font-weight: 760;
  letter-spacing: 0.05em;
}
.diary-date-copy small {
  color: var(--color-ink-3);
  font-size: 0.57rem;
}
.diary-date-input {
  position: absolute;
  right: 34px;
  bottom: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}

.diary-moods {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 3px;
  flex-shrink: 0;
}
.diary-mood {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  font-size: 0.92rem;
  filter: grayscale(0.42);
  opacity: 0.64;
  transition: transform 140ms ease, opacity 140ms ease, background 140ms ease;
}
.diary-mood:hover {
  opacity: 1;
  filter: none;
  transform: translateY(-1px);
}
.diary-mood.selected {
  border-color: color-mix(in srgb, var(--mood-tone) 46%, transparent);
  background: color-mix(in srgb, var(--mood-tone) 15%, transparent);
  box-shadow: 0 0 0 2px var(--color-surface);
  filter: none;
  opacity: 1;
}
.diary-mood-label {
  margin-left: auto;
  color: var(--color-ink-3);
  font-size: 0.56rem;
  white-space: nowrap;
}

.diary-throwback {
  min-height: 34px;
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex-shrink: 0;
  padding: 5px 8px;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--color-ink-2);
  cursor: pointer;
  text-align: left;
}
.diary-throwback span {
  flex-shrink: 0;
  color: var(--color-primary-hover);
  font-size: 0.52rem;
  font-weight: 760;
}
.diary-throwback strong {
  min-width: 0;
  overflow: hidden;
  font-size: 0.61rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diary-sheet {
  position: relative;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 6px 9px 5px;
  border: 1px solid var(--diary-rule);
  border-radius: 9px;
  background: repeating-linear-gradient(
    180deg,
    transparent 0 25px,
    var(--diary-rule) 25px 26px
  );
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.38) inset;
  transition: border-color 160ms ease, background-color 160ms ease;
}
.diary-sheet:focus-within {
  border-color: color-mix(in srgb, var(--color-ink) 18%, var(--diary-rule));
  background-color: color-mix(in srgb, var(--color-surface) 12%, transparent);
}
.diary-title-input,
.diary-content-input {
  width: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-ink);
  font-family: var(--font-family);
}
.diary-title-input {
  height: 26px;
  flex-shrink: 0;
  font-size: 0.77rem;
  font-weight: 720;
  line-height: 26px;
}
.diary-content-input {
  min-height: 0;
  flex: 1;
  resize: none;
  font-size: 0.73rem;
  line-height: 26px;
}
.diary-title-input:focus,
.diary-title-input:focus-visible,
.diary-content-input:focus,
.diary-content-input:focus-visible,
.diary-tags input:focus,
.diary-tags input:focus-visible {
  outline: none;
  box-shadow: none;
}
.diary-title-input,
.diary-content-input,
.diary-tags input { caret-color: var(--color-primary); }
.diary-title-input::placeholder { color: var(--color-ink-3); font-weight: 560; }
.diary-content-input::placeholder { color: color-mix(in srgb, var(--color-ink-3) 82%, transparent); }

.diary-tags {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 0 2px;
  color: var(--color-primary);
}
.diary-tags > span:first-child {
  font-size: 0.72rem;
  font-weight: 760;
}
.diary-tags input {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-ink-2);
  font: 500 0.59rem/1 var(--font-family);
}
.diary-tags input::placeholder { color: var(--color-ink-3); }
.diary-save-state {
  color: var(--color-ink-3);
  font-size: 0.52rem;
  white-space: nowrap;
}

.diary-footer {
  min-height: 18px;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  color: var(--color-ink-3);
  font-size: 0.54rem;
}
.diary-footer > span { margin-right: auto; }
.diary-delete,
.diary-today {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font: 620 0.54rem/1 var(--font-family);
}
.diary-delete:hover { color: var(--color-danger); }
.diary-today { color: var(--color-primary-hover); }

html.dark .diary-widget {
  --diary-paper: color-mix(in srgb, #3b352c 48%, transparent);
  --diary-rule: rgba(255, 236, 208, 0.08);
}
html.dark .diary-mood.selected { box-shadow: 0 0 0 2px #2b3037; }

/* Full diary library */
.journal-library {
  height: min(62vh, 560px);
  min-height: 420px;
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  gap: 20px;
}
.journal-library-aside {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: color-mix(in srgb, var(--color-surface-soft) 54%, transparent);
}
.journal-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 15px;
}
.journal-stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-surface) 74%, transparent);
}
.journal-stats strong {
  color: var(--color-ink);
  font: 400 1.45rem/1 Georgia, serif;
}
.journal-stats span {
  color: var(--color-ink-3);
  font-size: 0.56rem;
}
.journal-calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.journal-calendar-head strong {
  color: var(--color-ink-2);
  font-size: 0.68rem;
  font-weight: 700;
}
.journal-calendar-head button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font-size: 1rem;
}
.journal-calendar-head button:hover {
  background: color-mix(in srgb, var(--color-ink) 6%, transparent);
  color: var(--color-ink);
}
.journal-weekdays,
.journal-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.journal-weekdays span {
  padding-bottom: 4px;
  color: var(--color-ink-3);
  font-size: 0.5rem;
  text-align: center;
}
.journal-calendar-grid button {
  position: relative;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-ink-2);
  cursor: pointer;
  font: 620 0.62rem/1 var(--font-family);
}
.journal-calendar-grid button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 9%, transparent);
}
.journal-calendar-grid button.muted { color: color-mix(in srgb, var(--color-ink-3) 42%, transparent); }
.journal-calendar-grid button.today { color: var(--color-primary-hover); font-weight: 800; }
.journal-calendar-grid button.selected {
  background: var(--color-primary);
  color: #12382f;
  font-weight: 800;
}
.journal-calendar-grid button:disabled { cursor: default; opacity: 0.24; }
.journal-calendar-grid i {
  position: absolute;
  bottom: 3px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.8;
}
.journal-export {
  min-height: 34px;
  margin-top: auto;
  border: 1px solid color-mix(in srgb, var(--color-primary) 34%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  color: var(--color-primary-hover);
  cursor: pointer;
  font: 680 0.65rem/1 var(--font-family);
}
.journal-export:hover { background: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface)); }
.journal-privacy {
  margin-top: 8px;
  color: var(--color-ink-3);
  font-size: 0.5rem;
  line-height: 1.4;
  text-align: center;
}

.journal-library-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.journal-search {
  min-height: 39px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface-soft) 45%, transparent);
}
.journal-search:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 52%, var(--color-border));
  box-shadow: var(--focus-ring);
}
.journal-search svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: var(--color-ink-3);
  stroke-width: 1.5;
  stroke-linecap: round;
}
.journal-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-ink);
  font: 500 0.72rem/1 var(--font-family);
}
.journal-search input::placeholder { color: var(--color-ink-3); }
.journal-search button {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-ink) 6%, transparent);
  color: var(--color-ink-3);
  cursor: pointer;
}

.journal-entry-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}
.journal-entry-row {
  width: 100%;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 32px;
  gap: 12px;
  align-items: start;
  padding: 12px 8px;
  border: 0;
  border-bottom: 1px solid var(--color-line);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.journal-entry-row:hover { background: color-mix(in srgb, var(--color-primary) 5%, transparent); }
.journal-entry-row time {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.journal-entry-row time strong {
  color: var(--color-ink);
  font: 400 1.4rem/1 Georgia, serif;
}
.journal-entry-row time span {
  color: var(--color-ink-3);
  font-size: 0.5rem;
}
.journal-entry-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.journal-entry-topline {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.journal-entry-topline strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--color-ink);
  font-size: 0.73rem;
  font-weight: 730;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journal-entry-topline em {
  color: var(--color-ink-3);
  font-size: 0.55rem;
  font-style: normal;
  white-space: nowrap;
}
.journal-entry-preview {
  overflow: hidden;
  color: var(--color-ink-2);
  font-size: 0.63rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journal-entry-tags {
  display: flex;
  gap: 5px;
  overflow: hidden;
}
.journal-entry-tags i {
  color: var(--color-primary-hover);
  font-size: 0.52rem;
  font-style: normal;
  white-space: nowrap;
}
.journal-entry-weekday {
  padding-top: 3px;
  color: var(--color-ink-3);
  font-size: 0.52rem;
  text-align: right;
}
.journal-empty {
  height: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-ink-3);
  text-align: center;
}
.journal-empty > span {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  color: var(--color-primary);
  font-size: 1rem;
}
.journal-empty strong { color: var(--color-ink-2); font-size: 0.74rem; }
.journal-empty p { font-size: 0.63rem; }

@media (max-width: 680px) {
  .journal-library {
    height: auto;
    min-height: 0;
    grid-template-columns: 1fr;
  }
  .journal-library-aside {
    max-height: 300px;
  }
  .journal-calendar-head { display: none; }
  .journal-calendar-grid { display: none; }
  .journal-weekdays { display: none; }
  .journal-entry-list { max-height: 310px; }
}
</style>
