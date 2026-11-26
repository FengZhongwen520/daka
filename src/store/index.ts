import { ref, watch } from 'vue'
import { getItem, setItem } from '../storage'

const now = new Date()

export const selectedProjectId = ref<number | null>(null)
// Restore last project on module load
const lastId = getItem('last-project')
if (lastId) selectedProjectId.value = parseInt(lastId) || null
export const currentYear = ref(now.getFullYear())
export const currentMonth = ref(now.getMonth() + 1)

// Weather state (shared between WeatherFx and AppCalendar)
export interface WeatherData {
  temp: number
  code: number
  humidity: number
  windSpeed: number
  location: string
  hourly?: Array<{
    time: string
    temp: number
    code: number
    precipitation: number
  }>
  daily?: Array<{
    date: string
    minTemp: number
    maxTemp: number
    code: number
  }>
}
export const weatherData = ref<WeatherData | null>(null)
export const weatherLocationSource = ref<'manual' | 'geolocation' | 'timezone' | null>(null)
export const weatherLocationAccuracy = ref<number | null>(null)

// Wallpaper
export const weatherWallpaper = ref(getItem('weather-wallpaper') !== 'false')
export const customWallpaper = ref('')

watch(weatherWallpaper, (v) => {
  setItem('weather-wallpaper', String(v))
})

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = getItem(key)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    // Storage can be unavailable in restrictive browser modes.
  }
  return fallback
}

function readGlassOpacity(): number {
  try {
    const raw = getItem('daka-glass-opacity')
    if (raw == null) return 0.42
    const stored = Number(raw)
    if (Number.isFinite(stored)) return Math.min(0.8, Math.max(0.24, stored))
  } catch {
    // Storage can be unavailable in restrictive browser modes.
  }
  return 0.42
}

// Layout preferences
export const snapToGrid = ref(readBoolean('daka-snap-to-grid', true))
export const showLayoutGrid = ref(readBoolean('daka-show-layout-grid', false))
export const glassOpacity = ref(readGlassOpacity())
export const layoutArrangementRequest = ref(0)

watch(snapToGrid, value => setItem('daka-snap-to-grid', String(value)))
watch(showLayoutGrid, value => setItem('daka-show-layout-grid', String(value)))
watch(glassOpacity, (value) => {
  setItem('daka-glass-opacity', String(value))
  document.documentElement.style.setProperty('--widget-glass-alpha', String(value))
}, { immediate: true })

export function requestLayoutArrangement() {
  layoutArrangementRequest.value += 1
}

// Theme (light / dark / system)
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

function readThemeMode(): ThemeMode {
  try {
    const stored = getItem('theme-mode')
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Storage can be unavailable in restrictive browser modes.
  }
  return 'system'
}

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
export const themeMode = ref<ThemeMode>(readThemeMode())
export const resolvedTheme = ref<ResolvedTheme>('light')

function syncTheme() {
  const resolved: ResolvedTheme = themeMode.value === 'system'
    ? (systemThemeQuery.matches ? 'dark' : 'light')
    : themeMode.value
  resolvedTheme.value = resolved
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
}

watch(themeMode, (mode) => {
  try {
    setItem('theme-mode', mode)
  } catch {
    // The selected theme still applies for the current session.
  }
  syncTheme()
}, { immediate: true })

systemThemeQuery.addEventListener('change', () => {
  if (themeMode.value === 'system') syncTheme()
})

export function selectProject(id: number) {
  selectedProjectId.value = id
  setItem('last-project', String(id))
}

export function navigateMonth(delta: number) {
  let newMonth = currentMonth.value + delta
  let newYear = currentYear.value
  if (newMonth > 12) {
    newMonth = 1
    newYear++
  } else if (newMonth < 1) {
    newMonth = 12
    newYear--
  }
  currentYear.value = newYear
  currentMonth.value = newMonth
}
