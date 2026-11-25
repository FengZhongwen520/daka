<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { selectedProjectId, currentYear, currentMonth, navigateMonth } from '../../store'
import { getProjects } from '../../db'
import { getDaysInMonth, getFirstDayOfMonth, formatDate, todayStr } from '../../utils/date'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'
import type { Project } from '../../types'
import type { CalendarDay } from '../../utils/date'

const MONTHS_ZH = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
const WEEKDAYS_ZH = ['日','一','二','三','四','五','六']
const WEEKDAYS_FULL = ['周日','周一','周二','周三','周四','周五','周六']

// Drag
const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const posKey = `book-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 290, 100)

const project = ref<Project | null>(null)
const checkedDates = ref<Set<string>>(new Set())

// ========== 中国节假日数据（国务院办公厅通知；2027 为按新办法预测） ==========
function expandHoliday(start: string, end: string): string[] {
  const out: string[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const last = new Date(ey, em - 1, ed)
  while (cur <= last) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
function buildHolidays(ranges: [string, string, string][]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const [name, s, e] of ranges) for (const d of expandHoliday(s, e)) m[d] = name
  return m
}

const STATUTORY_HOLIDAYS: Record<string, string> = buildHolidays([
  // 2025
  ['元旦', '2025-01-01', '2025-01-01'],
  ['春节', '2025-01-28', '2025-02-04'],
  ['清明', '2025-04-04', '2025-04-06'],
  ['劳动节', '2025-05-01', '2025-05-05'],
  ['端午', '2025-05-31', '2025-06-02'],
  ['国庆节', '2025-10-01', '2025-10-08'],
  // 2026
  ['元旦', '2026-01-01', '2026-01-03'],
  ['春节', '2026-02-15', '2026-02-23'],
  ['清明', '2026-04-04', '2026-04-06'],
  ['劳动节', '2026-05-01', '2026-05-05'],
  ['端午', '2026-06-19', '2026-06-21'],
  ['中秋节', '2026-09-25', '2026-09-27'],
  ['国庆节', '2026-10-01', '2026-10-07'],
  // 2027（预测）
  ['元旦', '2027-01-01', '2027-01-03'],
  ['春节', '2027-02-05', '2027-02-13'],
  ['清明', '2027-04-03', '2027-04-05'],
  ['劳动节', '2027-05-01', '2027-05-05'],
  ['端午', '2027-06-09', '2027-06-09'],
  ['中秋节', '2027-09-15', '2027-09-15'],
  ['国庆节', '2027-10-01', '2027-10-07'],
])

const MAKEUP_WORKDAYS = new Set<string>([
  // 2025
  '2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',
  // 2026
  '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10',
  // 2027
  '2027-01-31', '2027-02-14', '2027-05-08', '2027-09-26', '2027-10-09',
])

// 日期当天信息：周末 / 节假日 / 调休上班
interface DayInfo {
  holiday?: string
  isWeekend: boolean
  isMakeup: boolean
  isFirstDay: boolean
}
function dayInfo(ds: string): DayInfo {
  const [y, m, d] = ds.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  const holiday = STATUTORY_HOLIDAYS[ds]
  const isMakeup = MAKEUP_WORKDAYS.has(ds)
  let isFirstDay = false
  if (holiday) {
    const prev = new Date(y, m - 1, d - 1)
    const prevStr = formatDate(prev.getFullYear(), prev.getMonth() + 1, prev.getDate())
    isFirstDay = STATUTORY_HOLIDAYS[prevStr] !== holiday
  }
  return { holiday, isWeekend: !isMakeup && (dow === 0 || dow === 6), isMakeup, isFirstDay }
}

// ========== 日历网格构建 ==========
interface CalDay extends CalendarDay {
  info?: DayInfo
}
const calendarDays = ref<CalDay[]>([])

function buildCalendarDays(year: number, month: number): CalDay[] {
  const days: CalDay[] = []
  const totalDays = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = todayStr()
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevDays = getDaysInMonth(prevYear, prevMonth)

  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ date: formatDate(prevYear, prevMonth, prevDays - i), day: prevDays - i, isCurrentMonth: false, isToday: false })
  }
  for (let d = 1; d <= totalDays; d++) {
    const date = formatDate(year, month, d)
    days.push({ date, day: d, isCurrentMonth: true, isToday: date === today, info: dayInfo(date) })
  }
  const remaining = 42 - days.length
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: formatDate(ny, nm, d), day: d, isCurrentMonth: false, isToday: false })
  }
  return days
}

// ========== 打卡 ==========
const checkinKey = computed(() => `cal-checkins-${props.widgetId ?? 'default'}`)

function loadLocalCheckIns() {
  const saved = JSON.parse(localStorage.getItem(checkinKey.value) || '[]')
  const prefix = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}`
  checkedDates.value = new Set(saved.filter((d: string) => d.startsWith(prefix)))
}

function saveLocalCheckIn(date: string, checked: boolean) {
  const saved = JSON.parse(localStorage.getItem(checkinKey.value) || '[]')
  if (checked) {
    if (!saved.includes(date)) saved.push(date)
  } else {
    const idx = saved.indexOf(date)
    if (idx >= 0) saved.splice(idx, 1)
  }
  localStorage.setItem(checkinKey.value, JSON.stringify(saved))
}

async function loadCheckIns() {
  if (selectedProjectId.value === null) return
  const projects = await getProjects()
  project.value = projects.find(p => p.id === selectedProjectId.value) || null
  loadLocalCheckIns()
}

watch(
  [selectedProjectId, currentYear, currentMonth],
  async () => {
    calendarDays.value = buildCalendarDays(currentYear.value, currentMonth.value)
    await loadCheckIns()
  },
  { immediate: true }
)

const checkedCountThisMonth = computed(() => {
  const prefix = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}`
  return [...checkedDates.value].filter(d => d.startsWith(prefix)).length
})

const totalDays = computed(() => getDaysInMonth(currentYear.value, currentMonth.value))

// Expose stats for parent
defineExpose({ checkedCountThisMonth, totalDays, project })

// 月份切换（无翻页，渐变过渡）
const monthKey = computed(() => `${currentYear.value}-${currentMonth.value}`)
function navigate(delta: number) {
  hoverDate.value = null
  pinnedDate.value = null
  navigateMonth(delta)
}

async function onToggleDay(day: CalendarDay) {
  if (!day.isCurrentMonth || selectedProjectId.value === null) return
  const checked = !checkedDates.value.has(day.date)
  saveLocalCheckIn(day.date, checked)
  const next = new Set(checkedDates.value)
  checked ? next.add(day.date) : next.delete(day.date)
  checkedDates.value = next
}

// ========== 每日事项 ==========
interface CalEvent {
  id: number
  text: string
  done: boolean
}

const eventsKey = `cal-events-${props.widgetId ?? 'default'}`
let parsedEvents: Record<string, CalEvent[]> | null = null
try {
  const raw = localStorage.getItem(eventsKey)
  parsedEvents = raw ? JSON.parse(raw) : null
} catch { /* 忽略损坏数据 */ }
const eventsByDate = ref<Record<string, CalEvent[]>>(parsedEvents ?? {})
let eventNextId = Math.max(0, ...Object.values(eventsByDate.value).flat().map(e => e.id)) + 1
watch(eventsByDate, (v) => localStorage.setItem(eventsKey, JSON.stringify(v)), { deep: true })

function eventsFor(date: string): CalEvent[] {
  return eventsByDate.value[date] ?? []
}
function addEvent(date: string, text: string) {
  const t = text.trim()
  if (!t) return
  if (!eventsByDate.value[date]) eventsByDate.value[date] = []
  eventsByDate.value[date].push({ id: eventNextId++, text: t, done: false })
}
function toggleEvent(date: string, id: number) {
  const ev = eventsByDate.value[date]?.find(e => e.id === id)
  if (ev) ev.done = !ev.done
}
function deleteEvent(date: string, id: number) {
  const list = (eventsByDate.value[date] ?? []).filter(e => e.id !== id)
  if (list.length) eventsByDate.value[date] = list
  else delete eventsByDate.value[date]
}

// 悬浮详情弹窗（延迟关闭避免穿越间隙闪烁）
const hoverDate = ref<string | null>(null)
// 点击＋后“钉住”弹窗：鼠标移出单元格也不会消失，可连续添加多个事项
const pinnedDate = ref<string | null>(null)
let popupTimer: ReturnType<typeof setTimeout> | null = null

function onCellEnter(date: string) {
  if (popupTimer) clearTimeout(popupTimer)
  if (pinnedDate.value) return   // 已钉住弹窗时不再预览其它日期
  hoverDate.value = date
}
function onCellLeave() {
  if (pinnedDate.value) return
  popupTimer = setTimeout(() => { hoverDate.value = null }, 180)
}
function onPopupEnter() {
  if (popupTimer) clearTimeout(popupTimer)
}
function onPopupLeave() {
  if (pinnedDate.value) return
  popupTimer = setTimeout(() => { hoverDate.value = null }, 180)
}
function closeAddPanel() {
  pinnedDate.value = null
  hoverDate.value = null
}
// 点击弹窗外部 / 按 Esc 收起钉住的弹窗
function onDocPointer(e: MouseEvent) {
  if (pinnedDate.value === null) return
  const target = e.target as HTMLElement
  if (target.closest('.day-popup') || target.closest('.day-add')) return
  closeAddPanel()
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAddPanel()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocPointer)
  document.addEventListener('keydown', onDocKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocPointer)
  document.removeEventListener('keydown', onDocKey)
})

// 添加事项 — 直接在悬浮弹窗内输入（＋ 在右侧，回车或点击添加）
const newEventText = ref('')
const popupInputRef = ref<HTMLInputElement | null>(null)
function openAddPanel(date: string) {
  if (pinnedDate.value === date) {   // 再点一次收起
    closeAddPanel()
    return
  }
  pinnedDate.value = date
  hoverDate.value = date
  nextTick(() => popupInputRef.value?.focus())
}
function addFromPopup(date: string) {
  addEvent(date, newEventText.value)
  newEventText.value = ''
  nextTick(() => popupInputRef.value?.focus())
}
function formatDateCN(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}月${d}日 ${WEEKDAYS_FULL[new Date(y, m - 1, d).getDay()]}`
}

// ========== 顶栏滚动通知栏：当天事项 ==========
const todayTickerText = computed(() => {
  const evs = eventsFor(todayStr())
  if (evs.length) return evs.map(e => e.text).join('　·　')
  const today = todayStr()
  if (STATUTORY_HOLIDAYS[today]) return `🏖 ${STATUTORY_HOLIDAYS[today]}`
  if (MAKEUP_WORKDAYS.has(today)) return '💼 调休上班'
  return '今天暂无安排'
})
const tickerWindowRef = ref<HTMLDivElement | null>(null)
const tickerActive = ref(false)
function updateTicker() {
  nextTick(() => {
    const win = tickerWindowRef.value
    if (!win) return
    const item = win.querySelector('.ticker-item') as HTMLElement | null
    if (!item) { tickerActive.value = false; return }
    const padRight = parseFloat(getComputedStyle(item).paddingRight) || 0
    tickerActive.value = item.scrollWidth - padRight > win.clientWidth
  })
}
watch(todayTickerText, updateTicker)
onMounted(updateTicker)
</script>

<template>
  <div class="book-wrapper" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="overlay" :on-drag-start="onDragStart" />
    <div class="cal-card">
      <!-- Header: 月份/年份竖排 + 中间当日事项滚动通知栏 + 导航按钮 -->
      <div class="calendar-header">
        <div class="header-left">
          <Transition name="cal-fade" mode="out-in">
            <div class="month-year" :key="monthKey">
              <div class="month-name">{{ MONTHS_ZH[currentMonth - 1] }}</div>
              <div class="year-name">{{ currentYear }}</div>
            </div>
          </Transition>
        </div>
        <div class="header-center">
          <div class="today-ticker">
            <span class="ticker-tag">今日</span>
            <div class="ticker-window" ref="tickerWindowRef">
              <div class="ticker-track" :class="{ scrolling: tickerActive }">
                <span class="ticker-item">{{ todayTickerText }}</span>
                <span v-if="tickerActive" class="ticker-item">{{ todayTickerText }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="header-nav-group">
          <button class="header-nav-btn" @click="navigate(-1)" title="上个月">◂</button>
          <button class="header-nav-btn" @click="navigate(1)" title="下个月">▸</button>
        </div>
      </div>

      <!-- 星期表头：六/日 用珊瑚色 -->
      <div class="weekday-row">
        <div v-for="(w, i) in WEEKDAYS_ZH" :key="w" class="weekday" :class="{ weekend: i === 0 || i === 6 }">{{ w }}</div>
      </div>

      <!-- 网格：月份切换时渐变淡入淡出 -->
      <Transition name="cal-fade" mode="out-in">
        <div class="calendar-grid" :key="monthKey">
          <div
            v-for="day in calendarDays"
            :key="day.date"
            class="day"
            :class="{
              'empty': !day.isCurrentMonth,
              'today': day.isToday,
              'checked': checkedDates.has(day.date),
              'weekend': day.info?.isWeekend,
              'holiday': !!day.info?.holiday,
              'makeup': day.info?.isMakeup,
            }"
            :style="checkedDates.has(day.date) ? { '--check-color': project?.color || 'var(--color-primary)' } : {}"
            @click="onToggleDay(day)"
            @mouseenter="onCellEnter(day.date)"
            @mouseleave="onCellLeave"
          >
            <button class="day-add" title="添加事项" @click.stop="openAddPanel(day.date)">＋</button>

            <span class="day-num">{{ day.day }}</span>
            <span v-if="day.isCurrentMonth && day.info?.holiday" class="day-tag">{{ day.info.isFirstDay ? day.info.holiday : '休' }}</span>
            <span v-else-if="day.isCurrentMonth && day.info?.isMakeup" class="day-tag makeup">班</span>

            <!-- 当日事项指示条 -->
            <div v-if="day.isCurrentMonth && eventsFor(day.date).length" class="day-events">
              <template v-for="(ev, i) in eventsFor(day.date)" :key="ev.id">
                <span v-if="i < 3" class="event-bar" :class="{ done: ev.done }"></span>
              </template>
              <span v-if="eventsFor(day.date).length > 3" class="event-more">+{{ eventsFor(day.date).length - 3 }}</span>
            </div>

            <span v-if="day.isToday" class="today-dot"></span>

            <!-- 悬浮详情弹窗：假期置顶 + 完整事项列表 + 直接添加 -->
            <div
              v-if="day.isCurrentMonth && (hoverDate === day.date || pinnedDate === day.date)"
              class="day-popup"
              @click.stop
              @mouseenter="onPopupEnter"
              @mouseleave="onPopupLeave"
            >
              <div class="popup-head">
                <span class="popup-date">{{ formatDateCN(day.date) }}</span>
                <button class="popup-close" title="关闭" @click.stop="closeAddPanel">✕</button>
              </div>
              <div v-if="day.info?.holiday" class="popup-holiday">🏖 {{ day.info.holiday }}</div>
              <div v-else-if="day.info?.isMakeup" class="popup-makeup">💼 调休上班</div>
              <ul class="popup-list">
                <li v-for="ev in eventsFor(day.date)" :key="ev.id" class="popup-item" :class="{ done: ev.done }">
                  <span class="popup-check" @click.stop="toggleEvent(day.date, ev.id)">{{ ev.done ? '✓' : '○' }}</span>
                  <span class="popup-text">{{ ev.text }}</span>
                  <button class="popup-del" title="删除" @click.stop="deleteEvent(day.date, ev.id)">✕</button>
                </li>
                <li v-if="eventsFor(day.date).length === 0" class="popup-empty">暂无事项，下方添加</li>
              </ul>
              <!-- 直接在弹窗内添加：＋ 在右侧 -->
              <div class="popup-add-row" @mousedown.stop>
                <input
                  ref="popupInputRef"
                  v-model="newEventText"
                  class="popup-input"
                  placeholder="添加事项，回车确认"
                  @keydown.enter="addFromPopup(day.date)"
                  @keydown.esc="closeAddPanel"
                />
                <button class="popup-add-go" title="添加" @click.stop="addFromPopup(day.date)">＋</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.book-wrapper {
  position: absolute;
  z-index: 54;
}
.book-wrapper:hover :deep(.drag-bar--overlay) { opacity: 1; }

/* 纸面日历卡 — 随主题反转（暗色为深卡 + 浅墨） */
.cal-card {
  position: relative;
  width: 420px;
  background: var(--color-paper);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-paper);
  padding: 16px 22px 14px;
}
/* 顶缘薄荷细线（自带上圆角，卡外不裁剪以容纳悬浮弹窗） */
.cal-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--color-primary) 0%, transparent 72%);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

/* Header — 左侧月份/年份竖排，中间当日事项滚动通知栏 */
.calendar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.header-left { flex-shrink: 0; }
.month-year {
  display: flex;
  flex-direction: column;
  line-height: 1;
}
.month-name {
  font-size: 1.55rem;
  font-weight: 900;
  color: var(--color-coral);
  line-height: 1;
  letter-spacing: 1px;
}
.year-name {
  font-size: 0.76rem;
  color: var(--color-ink-3);
  font-weight: 400;
  margin-top: 3px;
}
.header-center {
  flex: 1;
  min-width: 0;
}
.header-nav-group { flex-shrink: 0; display: flex; gap: 6px; }

/* 当日事项滚动通知栏 */
.today-ticker {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
}
.ticker-tag {
  flex-shrink: 0;
  font-size: 0.6rem;
  font-weight: 800;
  color: var(--color-coral);
  background: color-mix(in srgb, var(--color-coral) 12%, transparent);
  border-radius: 5px;
  padding: 1px 5px;
}
.ticker-window {
  flex: 1;
  min-width: 0;
  height: 16px;
  line-height: 16px;
  overflow: hidden;
}
.ticker-track {
  display: inline-flex;
  white-space: nowrap;
  will-change: transform;
}
.ticker-track.scrolling { animation: ticker-scroll 14s linear infinite; }
.ticker-item {
  font-size: 0.7rem;
  color: var(--color-ink-2);
  white-space: nowrap;
  padding-right: 48px;
}
@keyframes ticker-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.header-nav-btn {
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 14px;
  color: var(--color-ink-3);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.header-nav-btn:hover {
  background: var(--color-surface-soft);
  color: var(--color-coral);
  border-color: var(--color-coral);
  transform: translateY(-1px);
}

/* 星期表头 */
.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  padding-bottom: 4px;
  border-bottom: 2px solid var(--color-ink);
  margin-bottom: 6px;
}
.weekday {
  text-align: center;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--color-ink-3);
}
.weekday.weekend { color: var(--color-coral); }

/* 网格 — 数字加大 + 底部事项指示 */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.day {
  position: relative;
  height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 1px;
  padding: 4px 12px 0 0;   /* 右侧留白，避免悬浮＋按钮压住数字 */
  cursor: pointer;
  border-radius: 10px;
  transition: background 0.15s;
}
.day:hover:not(.empty) { background: rgba(0, 0, 0, 0.045); }
html.dark .day:hover:not(.empty) { background: rgba(255, 255, 255, 0.06); }

.day-num {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-ink);
  line-height: 1.15;
  transition: color 0.15s;
}
.day.weekend .day-num { color: var(--color-coral); }
.day.holiday .day-num { color: var(--color-danger); font-weight: 800; }
.day.makeup .day-num { color: var(--color-ink); }
.day.empty { visibility: hidden; }
.day.today .day-num { color: var(--color-coral); font-weight: 900; }

/* 打卡圈圈 — 项目色手绘圆环 */
.day.checked .day-num { color: var(--check-color, var(--color-primary)); font-weight: 700; }
.day.checked::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 2.5px solid var(--check-color, var(--color-primary));
  border-radius: 52% 48% 51% 49% / 48% 52% 49% 51%;
  transform: rotate(-10deg);
  animation: drawCircle 0.4s ease-out forwards;
  pointer-events: none;
}
@keyframes drawCircle {
  from { opacity: 0; transform: scale(1.5) rotate(-30deg); }
  to { opacity: 1; transform: scale(1) rotate(-10deg); }
}

/* 今天小圆点（左下角） */
.today-dot {
  position: absolute;
  bottom: 2px; left: 3px;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--color-coral);
}

/* 悬浮添加按钮（右上角，更靠右、稍放大） */
.day-add {
  position: absolute;
  top: 3px; right: 3px;
  width: 16px; height: 16px;
  border: none; border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 11px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  opacity: 0;
  padding: 0;
  z-index: 3;
  transition: opacity 0.15s, transform 0.15s;
}
.day:hover .day-add { opacity: 1; }
.day-add:hover { transform: scale(1.18); }

/* 节假日 / 调休 小标签 */
.day-tag {
  font-size: 0.42rem;
  font-weight: 700;
  color: var(--color-danger);
  letter-spacing: -0.5px;
  white-space: nowrap;
  line-height: 1;
  pointer-events: none;
}
.day-tag.makeup { color: var(--color-ink-3); font-weight: 600; }

/* 当日事项指示条 */
.day-events {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  padding-bottom: 3px;
  min-height: 3px;
}
.event-bar {
  width: 13px; height: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}
.event-bar.done { opacity: 0.35; }
.event-more {
  font-size: 0.42rem;
  color: var(--color-ink-3);
  line-height: 1;
}

/* 悬浮详情弹窗 */
.day-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 190px;
  background: var(--color-paper);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
  border: 1px solid var(--color-line);
  padding: 8px 10px;
  z-index: 90;
  text-align: left;
}
.popup-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.popup-date {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--color-ink);
}
.popup-close {
  flex-shrink: 0;
  width: 16px; height: 16px;
  border: none; border-radius: 50%;
  background: transparent;
  color: var(--color-ink-3);
  font-size: 9px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.popup-close:hover {
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
}
.popup-holiday {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  border-radius: 6px;
  padding: 2px 6px;
  margin-bottom: 5px;
}
.popup-makeup {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-ink-3);
  background: rgba(0,0,0,0.04);
  border-radius: 6px;
  padding: 2px 6px;
  margin-bottom: 5px;
}
.popup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 108px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.popup-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  color: var(--color-ink);
  padding: 2px 2px;
  border-radius: 5px;
}
.popup-item:hover { background: rgba(0,0,0,0.04); }
html.dark .popup-item:hover { background: rgba(255,255,255,0.05); }
.popup-item.done .popup-text { text-decoration: line-through; color: var(--color-ink-3); }
.popup-check {
  flex-shrink: 0;
  font-size: 11px;
  cursor: pointer;
  color: var(--color-primary);
  width: 13px;
  text-align: center;
}
.popup-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.popup-del {
  flex-shrink: 0;
  width: 15px; height: 15px;
  border: none; border-radius: 50%;
  background: transparent;
  color: var(--color-ink-3);
  font-size: 8px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
}
.popup-item:hover .popup-del { opacity: 1; }
.popup-del:hover {
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
}
.popup-empty {
  font-size: 0.7rem;
  color: var(--color-ink-3);
  padding: 4px 2px;
}

/* 弹窗内添加行 — ＋ 在右侧 */
.popup-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--color-line);
}
.popup-input {
  flex: 1;
  min-width: 0;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: 0.72rem;
  font-family: inherit;
  padding: 3px 7px;
  outline: none;
  transition: border-color 0.2s;
}
.popup-input:focus { border-color: var(--color-primary); }
.popup-input::placeholder { color: var(--color-ink-3); }
.popup-add-go {
  flex-shrink: 0;
  width: 20px; height: 20px;
  border: none; border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px; line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s;
}
.popup-add-go:hover { transform: scale(1.12); }

/* 月份渐变切换 */
.cal-fade-enter-active, .cal-fade-leave-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}
.cal-fade-enter-from { opacity: 0; transform: translateY(12px); }
.cal-fade-leave-to { opacity: 0; transform: translateY(-12px); }
</style>
