import { ref } from 'vue'
import {
  getItem,
  getSessionItem,
  removeItem,
  removeSessionItem,
  setItem,
  setSessionItem,
} from '../storage'
import {
  weatherData,
  weatherLocationAccuracy,
  weatherLocationSource,
  type WeatherData,
} from '../store'

const WEATHER_CACHE_KEY = 'daka-weather-cache-v5'
const LOCATION_CACHE_KEY = 'daka-weather-location-v4'
const MANUAL_LOCATION_KEY = 'daka-weather-manual-location-v3'
const GEOLOCATION_ATTEMPT_KEY = 'daka-weather-geolocation-attempted'
const CACHE_TTL = 10 * 60 * 1000
const LOCATION_TTL = 24 * 60 * 60 * 1000

interface WeatherLocation {
  latitude: number
  longitude: number
  label: string
  cachedAt: number
  source?: 'manual' | 'geolocation' | 'timezone'
  accuracy?: number
}

interface WeatherCache {
  cachedAt: number
  updatedAt: string
  location: WeatherLocation
  data: WeatherData
}

interface OpenMeteoResponse {
  current?: {
    time?: string
    temperature_2m?: number
    relative_humidity_2m?: number
    weather_code?: number
    wind_speed_10m?: number
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    weather_code?: number[]
    precipitation_probability?: number[]
  }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
  }
}

interface GeocodingResponse {
  results?: Array<{
    name?: string
    latitude?: number
    longitude?: number
  }>
}

interface ReverseGeocodingResponse {
  city?: string
  locality?: string
  principalSubdivision?: string
}

export const weatherLoading = ref(false)
export const weatherError = ref('')
export const weatherUpdatedAt = ref('')

let inflightRequest: Promise<boolean> | null = null

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(getItem(key) || 'null') as T | null
  } catch {
    return null
  }
}

function readWeatherCache(): WeatherCache | null {
  const cache = readJson<WeatherCache>(WEATHER_CACHE_KEY)
  if (!cache || !cache.data || !Number.isFinite(cache.cachedAt)) return null
  return cache
}

function applyCachedWeather(cache: WeatherCache) {
  weatherData.value = cache.data
  weatherLocationSource.value = cache.location.source || 'timezone'
  weatherLocationAccuracy.value = cache.location.accuracy ?? null
  weatherUpdatedAt.value = `${cache.updatedAt} · 缓存`
  weatherError.value = ''
}

function timezoneCity(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const city = timezone.split('/').pop()?.replaceAll('_', ' ') || ''
  if (!city || city === 'UTC' || city === 'GMT') return 'Shanghai'
  return city
}

async function geocodeCity(city: string): Promise<WeatherLocation | null> {
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    url.searchParams.set('name', city)
    url.searchParams.set('count', '1')
    url.searchParams.set('language', 'zh')
    url.searchParams.set('format', 'json')
    const response = await fetch(url)
    if (!response.ok) return null
    const payload = await response.json() as GeocodingResponse
    const result = payload.results?.[0]
    if (
      result
      && Number.isFinite(result.latitude)
      && Number.isFinite(result.longitude)
    ) {
      return {
        latitude: Number(result.latitude),
        longitude: Number(result.longitude),
        label: result.name || city,
        cachedAt: Date.now(),
      }
    }
  } catch {
    // The fallback location below keeps weather usable when geocoding is unavailable.
  }
  return null
}

function requestGeolocation(): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) return Promise.resolve(null)
  if (getSessionItem(GEOLOCATION_ATTEMPT_KEY) === 'denied') {
    return Promise.resolve(null)
  }

  setSessionItem(GEOLOCATION_ATTEMPT_KEY, 'pending')
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => {
        setSessionItem(GEOLOCATION_ATTEMPT_KEY, 'granted')
        resolve(position)
      },
      () => {
        setSessionItem(GEOLOCATION_ATTEMPT_KEY, 'denied')
        resolve(null)
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    )
  })
}

async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client')
    url.searchParams.set('latitude', String(latitude))
    url.searchParams.set('longitude', String(longitude))
    url.searchParams.set('localityLanguage', 'zh')
    const response = await fetch(url)
    if (!response.ok) return null
    const payload = await response.json() as ReverseGeocodingResponse
    return payload.city || payload.locality || payload.principalSubdivision || null
  } catch {
    return null
  }
}

async function resolveLocation(allowGeolocation = false): Promise<WeatherLocation> {
  const manual = readJson<WeatherLocation>(MANUAL_LOCATION_KEY)
  if (
    manual
    && Number.isFinite(manual.latitude)
    && Number.isFinite(manual.longitude)
  ) {
    return { ...manual, source: 'manual' }
  }

  const cached = readJson<WeatherLocation>(LOCATION_CACHE_KEY)
  const cachedMaxAge = cached?.source === 'geolocation'
    ? 30 * 60 * 1000
    : LOCATION_TTL
  const accurateEnough = cached?.source !== 'geolocation'
    || (cached?.accuracy ?? Number.POSITIVE_INFINITY) <= 50_000
  if (
    cached
    && Number.isFinite(cached.latitude)
    && Number.isFinite(cached.longitude)
    && Date.now() - cached.cachedAt < cachedMaxAge
    && accurateEnough
  ) {
    return cached
  }

  const position = allowGeolocation ? await requestGeolocation() : null
  if (position) {
    const latitude = position.coords.latitude
    const longitude = position.coords.longitude
    const accuracy = Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : undefined
    const label = await reverseGeocode(latitude, longitude) || '当前位置'
    const location: WeatherLocation = {
      latitude,
      longitude,
      label,
      cachedAt: Date.now(),
      source: 'geolocation',
      accuracy,
    }
    setItem(LOCATION_CACHE_KEY, JSON.stringify(location))
    return location
  }

  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const geocoded = await geocodeCity(timezoneCity())
  const location: WeatherLocation = geocoded
    ? { ...geocoded, source: 'timezone' }
    : {
        latitude: 31.2304,
        longitude: 121.4737,
        label: localTimezone === 'Asia/Shanghai' ? '上海' : '默认位置',
        cachedAt: Date.now(),
        source: 'timezone',
      }
  setItem(LOCATION_CACHE_KEY, JSON.stringify(location))
  return location
}

function formatUpdateTime(value: unknown): string {
  if (typeof value !== 'string') {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  const time = value.split('T')[1]
  return time ? time.slice(0, 5) : value
}

async function loadWeather(force: boolean, allowGeolocation = false): Promise<boolean> {
  const cached = readWeatherCache()
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    applyCachedWeather(cached)
    return true
  }

  weatherLoading.value = true
  weatherError.value = ''

  try {
    const location = await resolveLocation(allowGeolocation)
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(location.latitude))
    url.searchParams.set('longitude', String(location.longitude))
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    )
    url.searchParams.set(
      'hourly',
      'temperature_2m,weather_code,precipitation_probability',
    )
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min',
    )
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '4')
    url.searchParams.set('forecast_hours', '24')

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`)
    const payload = await response.json() as OpenMeteoResponse
    const current = payload.current
    if (!current || !Number.isFinite(current.temperature_2m)) {
      throw new Error('Open-Meteo returned no current weather')
    }

    const updatedAt = formatUpdateTime(current.time)
    const currentTime = typeof current.time === 'string' ? current.time : ''
    const hourlyTimes = payload.hourly?.time || []
    const hourly: NonNullable<WeatherData['hourly']> = []
    for (let index = 0; index < hourlyTimes.length && hourly.length < 8; index += 1) {
      const time = hourlyTimes[index]
      if (currentTime && time < currentTime.slice(0, 13) + ':00') continue
      const temp = payload.hourly?.temperature_2m?.[index]
      if (!Number.isFinite(temp)) continue
      hourly.push({
        time,
        temp: Math.round(Number(temp)),
        code: Number(payload.hourly?.weather_code?.[index] ?? 2),
        precipitation: Math.round(Number(payload.hourly?.precipitation_probability?.[index] ?? 0)),
      })
    }
    const daily: NonNullable<WeatherData['daily']> = []
    ;(payload.daily?.time || []).slice(0, 3).forEach((date, index) => {
      const maxTemp = payload.daily?.temperature_2m_max?.[index]
      const minTemp = payload.daily?.temperature_2m_min?.[index]
      if (!Number.isFinite(maxTemp) || !Number.isFinite(minTemp)) return
      daily.push({
        date,
        maxTemp: Math.round(Number(maxTemp)),
        minTemp: Math.round(Number(minTemp)),
        code: Number(payload.daily?.weather_code?.[index] ?? 2),
      })
    })
    const data: WeatherData = {
      temp: Math.round(Number(current.temperature_2m) * 10) / 10,
      code: Number(current.weather_code ?? 2),
      humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
      windSpeed: Math.round(Number(current.wind_speed_10m ?? 0)),
      location: location.label,
      hourly,
      daily,
    }
    const cache: WeatherCache = {
      cachedAt: Date.now(),
      updatedAt,
      location,
      data,
    }

    weatherData.value = data
    weatherLocationSource.value = location.source || 'timezone'
    weatherLocationAccuracy.value = location.accuracy ?? null
    weatherUpdatedAt.value = updatedAt
    setItem(WEATHER_CACHE_KEY, JSON.stringify(cache))
    return true
  } catch {
    if (cached) {
      applyCachedWeather(cached)
      return true
    }
    weatherData.value = null
    weatherUpdatedAt.value = ''
    weatherError.value = '天气服务暂时不可用'
    return false
  } finally {
    weatherLoading.value = false
  }
}

export function refreshWeather(force = false, allowGeolocation = false): Promise<boolean> {
  if (inflightRequest) return inflightRequest
  inflightRequest = loadWeather(force, allowGeolocation).finally(() => {
    inflightRequest = null
  })
  return inflightRequest
}

export async function setWeatherCity(city: string): Promise<boolean> {
  const location = await geocodeCity(city.trim())
  if (!location) return false
  setItem(MANUAL_LOCATION_KEY, JSON.stringify({
    ...location,
    cachedAt: Date.now(),
    source: 'manual',
  }))
  removeItem(WEATHER_CACHE_KEY)
  return refreshWeather(true)
}

export async function useAutomaticWeatherLocation(): Promise<boolean> {
  removeItem(MANUAL_LOCATION_KEY)
  removeItem(LOCATION_CACHE_KEY)
  removeItem(WEATHER_CACHE_KEY)
  removeSessionItem(GEOLOCATION_ATTEMPT_KEY)
  return refreshWeather(true, true)
}

const initialCache = readWeatherCache()
if (initialCache && Date.now() - initialCache.cachedAt < CACHE_TTL) {
  applyCachedWeather(initialCache)
}
