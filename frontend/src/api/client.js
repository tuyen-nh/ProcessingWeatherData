// Single switch between mock data and the real Express Serving Layer API.
// Flip USE_MOCK to false (and set BASE) when the backend is ready — no other change needed.
import { mockRealtime, mockHistory, mockCompare, mockAlerts, mockStats } from './mock.js'

export const USE_MOCK = true
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

// fake network latency so loading states are visible
const delay = (data, ms = 350) =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms))

async function real(path) {
  const res = await fetch(`${BASE}/api/weather${path}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

export function getRealtime(cityId) {
  return USE_MOCK ? delay(mockRealtime(cityId)) : real(`/realtime?city_id=${cityId}`)
}

export function getHistory(cityId, startDate, endDate) {
  return USE_MOCK
    ? delay(mockHistory(cityId, startDate, endDate))
    : real(`/history?city_id=${cityId}&start_date=${startDate}&end_date=${endDate}`)
}

export function getCompare(cityId) {
  return USE_MOCK ? delay(mockCompare(cityId)) : real(`/compare?city_id=${cityId}`)
}

export function getAlerts(cityId, severity) {
  if (USE_MOCK) return delay(mockAlerts(cityId))
  const q = new URLSearchParams()
  if (cityId) q.set('city_id', cityId)
  if (severity) q.set('severity', severity)
  return real(`/alerts?${q.toString()}`)
}

export function getStats() {
  return USE_MOCK ? delay(mockStats()) : real('/stats')
}
