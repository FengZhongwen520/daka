<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { selectedProjectId, currentYear, currentMonth, navigateMonth } from '../../store'
import { getProjects, getCheckIns, toggleCheckIn } from '../../db'
import { getDaysInMonth, getFirstDayOfMonth, formatDate, todayStr } from '../../utils/date'
import { useDraggable } from '../../composables/useDraggable'
import type { Project } from '../../types'
import type { CalendarDay } from '../../utils/date'

const MONTHS_ZH = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
const WEEKDAYS_ZH = ['日','一','二','三','四','五','六']

// Drag
const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const posKey = `book-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const saved = JSON.parse(localStorage.getItem(posKey) || 'null')
const { x, y, onDragStart } = useDraggable(saved?.x ?? props.initialX ?? 290, saved?.y ?? props.initialY ?? 100)
watch([x, y], () => localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value })))
const MONTHS_EN = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']

const project = ref<Project | null>(null)
const checkedDates = ref<Set<string>>(new Set())
const flipped = ref(false)
const pageRef = ref<HTMLElement>()
const calSize = ref<'small' | 'medium' | 'large'>(localStorage.getItem('cal-size') as any || 'medium')
watch(calSize, (v) => localStorage.setItem('cal-size', v))

function toggleSize() {
  const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large']
  const idx = sizes.indexOf(calSize.value)
  calSize.value = sizes[(idx + 1) % 3]
}

const sizeMap = { small: { w: 420, h: 320 }, medium: { w: 580, h: 440 }, large: { w: 720, h: 540 } }
const nextPageHTML = ref('')

function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const days: CalendarDay[] = []
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
    days.push({ date, day: d, isCurrentMonth: true, isToday: date === today })
  }
  const remaining = 42 - days.length
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: formatDate(ny, nm, d), day: d, isCurrentMonth: false, isToday: false })
  }
  return days
}

function buildStaticHTML(year: number, month: number, checkSet: Set<string>): string {
  const totalDays = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = todayStr()
  let html = `<div class="calendar-header"><div class="month-name">${MONTHS_EN[month-1]}</div><div class="year-name">${year}</div></div>`
  html += `<div class="calendar-grid" style="grid-template-columns:repeat(7,1fr);gap:3px;padding:0 30px;">`
  WEEKDAYS_ZH.forEach(w => { html += `<div class="weekday" style="text-align:center;font-weight:800;color:#d1d8e0;font-size:0.8rem;padding-bottom:2px;">${w}</div>` })
  for (let i = 0; i < firstDay; i++) html += `<div class="day empty"></div>`
  for (let d = 1; d <= totalDays; d++) {
    const ds = formatDate(year, month, d)
    const isToday = ds === today
    const isChecked = checkSet.has(ds)
    html += `<div class="day${isToday?' today':''}${isChecked?' checked':''}">${d}</div>`
  }
  html += `</div>`
  return html
}

async function loadCheckIns() {
  if (selectedProjectId.value === null) return
  const projects = await getProjects()
  project.value = projects.find(p => p.id === selectedProjectId.value) || null
  if (project.value) {
    const checkins = await getCheckIns(project.value.id!, currentYear.value, currentMonth.value)
    checkedDates.value = new Set(checkins.map(c => c.date))
  }
}

const calendarDays = ref<CalendarDay[]>([])

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

function flipPage(delta: number) {
  if (flipped.value || !pageRef.value) return
  // Show CURRENT month on the base layer during flip — avoids next-month text leaking through
  nextPageHTML.value = buildStaticHTML(currentYear.value, currentMonth.value, checkedDates.value)
  flipped.value = true
  setTimeout(() => {
    navigateMonth(delta)
    const el = pageRef.value!
    el.style.transition = 'none'
    flipped.value = false
    nextTick(() => {
      nextPageHTML.value = ''
      void el.offsetHeight
      el.style.transition = 'transform 0.8s cubic-bezier(0.645, 0.045, 0.355, 1)'
    })
  }, 800)
}

async function onToggleDay(day: CalendarDay) {
  if (!day.isCurrentMonth || selectedProjectId.value === null) return
  if (flipped.value) return // prevent clicks during page flip animation
  const checked = await toggleCheckIn(selectedProjectId.value, day.date)
  const next = new Set(checkedDates.value)
  checked ? next.add(day.date) : next.delete(day.date)
  checkedDates.value = next
}
</script>

<template>
  <div class="book-wrapper" :style="{ left: x + 'px', top: y + 'px' }">
    <div class="book-drag-bar" @mousedown="onDragStart">
      <span class="drag-dots">⋮⋮</span>
    </div>
    <div class="book-container" :style="{ width: sizeMap[calSize].w + 'px', height: sizeMap[calSize].h + 'px' }">
      <div class="book-base" v-html="nextPageHTML"></div>
      <div class="page" :class="{ flipped }" ref="pageRef">
        <div class="page-content">
          <div class="calendar-header">
            <div class="header-left">
              <div class="month-name">{{ MONTHS_ZH[currentMonth - 1] }}</div>
              <div class="year-name">{{ currentYear }}</div>
            </div>
            <div class="header-nav-group">
              <button class="header-nav-btn" @click="flipPage(-1)">◂</button>
              <button class="header-nav-btn" @click="flipPage(1)">▸</button>
              <button class="header-nav-btn header-size-btn" @click="toggleSize" :title="`尺寸: ${calSize}`">{{ calSize === 'small' ? '小' : calSize === 'medium' ? '中' : '大' }}</button>
            </div>
          </div>
          <div class="calendar-grid">
            <div v-for="w in WEEKDAYS_ZH" :key="w" class="weekday">{{ w }}</div>
            <div
              v-for="day in calendarDays"
              :key="day.date"
              class="day"
              :class="{
                'empty': !day.isCurrentMonth,
                'today': day.isToday,
                'checked': checkedDates.has(day.date),
              }"
              :style="checkedDates.has(day.date) ? { '--check-color': project?.color || '#1dd1a1' } : {}"
              @click="onToggleDay(day)"
            >
              <template v-if="day.isCurrentMonth">{{ day.day }}</template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.book-wrapper {
  position: absolute;
  z-index: 54;
  padding-top: 24px; /* reserve space for absolute drag bar — prevents layout shift */
}

.book-drag-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: 5px 5px 0 0;
  z-index: 10;
}
.book-wrapper:hover .book-drag-bar { opacity: 1; }
.book-drag-bar:active { cursor: grabbing; background: rgba(0,0,0,0.16); }

.drag-dots {
  color: rgba(255,255,255,0.6);
  font-size: 16px;
  letter-spacing: 4px;
  user-select: none;
}

.book-container {
  position: relative;
  width: 580px;
  height: 440px;
  transform-style: preserve-3d;
  transform: rotateX(6deg) rotateY(-2deg);
}

.book-base {
  position: absolute;
  width: 100%;
  height: 100%;
  background: #fff;
  border-radius: 5px 15px 15px 5px;
  box-shadow: 2px 0 0 #ddd, 20px 30px 50px rgba(0,0,0,0.35);
  overflow: hidden;
}

.page {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background: #fdfdfd;
  border-radius: 5px 15px 15px 5px;
  transform-origin: left center;
  transition: transform 0.8s cubic-bezier(0.645, 0.045, 0.355, 1);
  transform-style: preserve-3d;
  z-index: 2;
  backface-visibility: hidden;
  box-shadow: inset 10px 0 30px rgba(0,0,0,0.05);
}
.page.flipped { transform: rotateY(-170deg); }

.page-content {
  padding: 20px 30px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-image: radial-gradient(#e5e5e5 1px, transparent 1px);
  background-size: 28px 28px;
  overflow: hidden;
}

/* Header */
.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 10px;
  border-bottom: 3px solid #2d3436;
  padding-bottom: 6px;
  flex-shrink: 0;
}
.header-left { display: flex; align-items: flex-end; gap: 10px; }
.header-nav-group { display: flex; gap: 4px; }
.header-size-btn { width: auto; padding: 0 8px; border-radius: 14px; font-size: 11px; font-weight: 700; }
.header-nav-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1.5px solid #e0e0e0;
  background: #fafafa;
  cursor: pointer;
  font-size: 16px;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.header-nav-btn:hover {
  background: #f0f0f0;
  color: #ff6b6b;
  border-color: #ff6b6b;
}
.month-name {
  font-size: 2.5rem;
  font-weight: 900;
  color: #ff6b6b;
  line-height: 0.85;
  letter-spacing: 2px;
}
.year-name {
  font-size: 1.3rem;
  color: #bdc3c7;
  font-weight: 300;
}

/* Grid */
.calendar-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: auto repeat(6, 1fr);
  gap: 3px;
  min-height: 0;
}
.weekday {
  text-align: center;
  font-weight: 800;
  color: #d1d8e0;
  font-size: 0.8rem;
  padding-bottom: 2px;
}
.day {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 600;
  color: #2d3436;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s, color 0.15s;
}
.day:hover:not(.empty) {
  background: rgba(0,0,0,0.04);
}
.day.empty { visibility: hidden; }
.day.checked { color: var(--check-color, #1dd1a1); }
.day.checked::before {
  content: '';
  position: absolute;
  width: 75%; height: 75%;
  border: 3px solid var(--check-color, #1dd1a1);
  border-radius: 52% 48% 51% 49% / 48% 52% 49% 51%;
  transform: rotate(-10deg);
  animation: drawCircle 0.4s ease-out forwards;
  pointer-events: none;
}
@keyframes drawCircle {
  from { opacity: 0; transform: scale(1.5) rotate(-30deg); }
  to { opacity: 1; transform: scale(1) rotate(-10deg); }
}
.day.today { color: #ff6b6b; }
.day.today::after {
  content: '';
  position: absolute;
  bottom: 3px; left: 50%; transform: translateX(-50%);
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #ff6b6b;
}

/* Book base (deep) */
:deep(.book-base .calendar-header) {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 10px; border-bottom: 3px solid #2d3436;
  padding: 20px 30px 6px;
}
:deep(.book-base .month-name) { font-size: 2.5rem; font-weight: 900; color: #ddd; line-height: 0.85; }
:deep(.book-base .year-name) { font-size: 1.3rem; color: #ddd; font-weight: 300; }
:deep(.book-base .calendar-grid) { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; padding: 0 30px; }
:deep(.book-base .weekday) { text-align: center; font-weight: 800; color: #ddd; font-size: 0.8rem; }
:deep(.book-base .day) { display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 600; color: #ddd; }
:deep(.book-base .day.empty) { visibility: hidden; }
:deep(.book-base .day.today) { color: #ff6b6b; }
:deep(.book-base .day.checked) { color: #1dd1a1; }
</style>
