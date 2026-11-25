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

// Theme (light / dark)
export type ThemeMode = 'light' | 'dark'
export const themeMode = ref<ThemeMode>((localStorage.getItem('theme-mode') as ThemeMode) || 'light')

function applyTheme() {
  document.documentElement.classList.toggle('dark', themeMode.value === 'dark')
}
watch(themeMode, (m) => {
  localStorage.setItem('theme-mode', m)
  applyTheme()
}, { immediate: true })

export function toggleTheme() {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark'
}

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
