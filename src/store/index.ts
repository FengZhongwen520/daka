import { ref, watch } from 'vue'

const now = new Date()

export const selectedProjectId = ref<number | null>(null)
// Restore last project on module load
const lastId = localStorage.getItem('last-project')
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
}
export const weatherData = ref<WeatherData | null>(null)
export const weatherLocationSource = ref<'manual' | 'geolocation' | 'timezone' | null>(null)
export const weatherLocationAccuracy = ref<number | null>(null)

// Wallpaper
export const weatherWallpaper = ref(localStorage.getItem('weather-wallpaper') !== 'false')
export const customWallpaper = ref('')

watch(weatherWallpaper, (v) => {
  localStorage.setItem('weather-wallpaper', String(v))
})

// Theme (light / dark / system)
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

function readThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem('theme-mode')
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
    localStorage.setItem('theme-mode', mode)
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
  localStorage.setItem('last-project', String(id))
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
