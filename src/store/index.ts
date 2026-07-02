import { ref } from 'vue'

const now = new Date()

export const selectedProjectId = ref<number | null>(null)
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

export function selectProject(id: number) {
  selectedProjectId.value = id
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
