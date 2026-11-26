import { apiRequest } from '../storage/api'

export interface PomodoroState {
  widgetId: number
  mode: 'focus' | 'break'
  running: boolean
  focusMinutes: number
  breakMinutes: number
  remainingSeconds: number
  deadline: string | null
  notificationsEnabled: boolean
  updatedAt: string
}

export interface PomodoroEvent {
  ownerId: string
  state: PomodoroState
  completed: boolean
  serverTime: string
}

export interface WaterState {
  widgetId: number
  date: string
  totalMl: number
  lastDrinkAt: string | null
  idleMinutes: number | null
}

export function getPomodoro(token: string, widgetId: number): Promise<PomodoroState> {
  return apiRequest<PomodoroState>(`/pomodoro/${widgetId}`, {}, token)
}

export function startPomodoro(token: string, widgetId: number): Promise<PomodoroState> {
  return apiRequest<PomodoroState>(`/pomodoro/${widgetId}/start`, { method: 'POST' }, token)
}

export function pausePomodoro(token: string, widgetId: number): Promise<PomodoroState> {
  return apiRequest<PomodoroState>(`/pomodoro/${widgetId}/pause`, { method: 'POST' }, token)
}

export function resetPomodoro(token: string, widgetId: number): Promise<PomodoroState> {
  return apiRequest<PomodoroState>(`/pomodoro/${widgetId}/reset`, { method: 'POST' }, token)
}

export function savePomodoroSettings(
  token: string,
  widgetId: number,
  focusMinutes: number,
  breakMinutes: number,
): Promise<PomodoroState> {
  return apiRequest<PomodoroState>(`/pomodoro/${widgetId}/settings`, {
    method: 'POST',
    body: JSON.stringify({ focusMinutes, breakMinutes }),
  }, token)
}

export function setPomodoroNotifications(
  token: string,
  widgetId: number,
  enabled: boolean,
): Promise<PomodoroState> {
  return apiRequest<PomodoroState>(`/pomodoro/${widgetId}/notifications`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  }, token)
}

export function getWater(
  token: string,
  widgetId: number,
  date: string,
): Promise<WaterState> {
  return apiRequest<WaterState>(
    `/water/${widgetId}?date=${encodeURIComponent(date)}`,
    {},
    token,
  )
}

export function drinkWater(
  token: string,
  widgetId: number,
  date: string,
  amountMl = 250,
): Promise<WaterState> {
  return apiRequest<WaterState>(`/water/${widgetId}/drink`, {
    method: 'POST',
    body: JSON.stringify({ date, amountMl }),
  }, token)
}
