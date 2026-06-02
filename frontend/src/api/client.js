// Single switch between mock data and the real Express Serving Layer API.
// The real API keys on station_id/province and uses different field names than
// the components, so each get* function adapts the response back into the shape
// the UI already expects. Flip USE_MOCK to true to fall back to mock generators.
import { mockRealtime, mockHistory, mockCompare, mockAlerts, mockStats } from './mock.js'
import { cityById, cityByName, CITIES } from '../data/cities.js'
import { aqiCategory, pm25ToAQI } from '../utils/aqi.js'

export const USE_MOCK = false
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

// Kafka producer pushes a fresh batch every 120s (ApiToKafkaProducer Thread.sleep).
// Speed-layer pages poll on this cadence.
export const SPEED_POLL_MS = 120000

// fake network latency so loading states are visible (mock mode only)
const delay = (data, ms = 350) =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms))

async function real(path) {
  const res = await fetch(`${BASE}/api/weather${path}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

// aqi_alert / temp_alert values the API emits that we treat as an anomaly.
const ANOMALY_AQI = ['Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous']
const ANOMALY_TEMP = ['Extreme Heat', 'Too Cold']

// ── Realtime: GET /realtime?station_id= → array, take latest, reshape ──
async function realRealtime(cityId) {
  const city = cityById(cityId)
  const arr = await real(`/realtime?station_id=${city.station_id}`)
  const d = arr[0]
  if (!d) throw new Error(`No realtime data for ${city.city_name}`)
  return {
    city_id: city.city_id,
    city_name: city.city_name,
    temp: d.temperature,
    humidity: d.humidity,
    pm2_5: d.pm25,
    aqi_value: d.aqi_index,
    aqi_category: aqiCategory(d.aqi_index),
    is_anomaly: ANOMALY_AQI.includes(d.aqi_alert) || ANOMALY_TEMP.includes(d.temp_alert),
    timestamp: d.timestamp,
  }
}

// ── Realtime (all): GET /realtime → latest reading per station (~34 rows) ──
// Powers the all-provinces table. No station_id → one doc per station, newest.
async function realRealtimeAll() {
  const arr = await real('/realtime')
  return arr.map((d) => ({
    station_id: d.station_id,
    province: d.province,
    region: d.region,
    temp: d.temperature,
    humidity: d.humidity,
    pm2_5: d.pm25,
    no2: d.no2,
    aqi_value: d.aqi_index,
    aqi_category: aqiCategory(d.aqi_index),
    aqi_alert: d.aqi_alert,
    temp_alert: d.temp_alert,
    is_anomaly: ANOMALY_AQI.includes(d.aqi_alert) || ANOMALY_TEMP.includes(d.temp_alert),
    timestamp: d.timestamp,
  }))
}

// temp_alert mirrors StreamingAQI.java thresholds (<10 / ≤35 / ≤40 / >40).
function tempAlertOf(temp) {
  if (temp == null) return 'Normal'
  if (temp < 10) return 'Too Cold'
  if (temp <= 35) return 'Normal'
  if (temp <= 40) return 'Hot'
  return 'Extreme Heat'
}

// Mock fallback: one synthesized snapshot per known city.
function mockRealtimeAll() {
  return CITIES.map((c) => {
    const r = mockRealtime(c.city_id)
    return {
      ...r,
      station_id: c.station_id,
      region: c.region,
      province: c.city_name,
      aqi_alert: r.aqi_category, // mock category strings match aqi_alert bands
      temp_alert: tempAlertOf(r.temp),
    }
  })
}

export function getRealtimeAll() {
  return USE_MOCK ? delay(mockRealtimeAll()) : realRealtimeAll()
}

// ── History: GET /daily?station_id=&start_date=&end_date= → per-day rows ──
// Daily aggregates computed from RealTimeReadings. Already in the component shape.
async function realHistory(cityId, startDate, endDate) {
  const city = cityById(cityId)
  const q = new URLSearchParams({ station_id: city.station_id })
  if (startDate) q.set('start_date', startDate)
  if (endDate) q.set('end_date', endDate)
  const rows = await real(`/daily?${q.toString()}`)
  return rows.map((r) => ({
    date: r.date,
    avg_temp: r.avg_temp,
    max_temp: r.max_temp,
    min_temp: r.min_temp,
    avg_aqi: r.avg_aqi,
    peak_aqi_hour: r.peak_aqi_hour,
  }))
}

// ── Compare: GET /compare?station_id= → reshape, derive historical AQI ──
async function realCompare(cityId) {
  const city = cityById(cityId)
  const c = await real(`/compare?station_id=${city.station_id}`)
  const current_aqi = c.current_aqi
  const historical_avg_aqi = pm25ToAQI(c.historical_avg_pm25)
  return {
    city_id: city.city_id,
    city_name: c.province ?? city.city_name,
    current_temp: c.current_temp,
    historical_avg_temp: c.historical_avg_temp,
    temp_deviation: c.temp_deviation,
    current_aqi,
    historical_avg_aqi,
    aqi_deviation:
      current_aqi != null && historical_avg_aqi != null ? current_aqi - historical_avg_aqi : null,
  }
}

// ── Alerts: GET /alerts → map API alert_type to the UI's TYPE_STYLE keys ──
async function realAlerts(cityId, severity) {
  const q = new URLSearchParams()
  if (cityId) q.set('province', cityById(cityId)?.city_name ?? '')
  if (severity) q.set('severity', severity)
  const arr = await real(`/alerts?${q.toString()}`)
  return arr.map((a) => {
    const isAqi = a.alert_type === 'Air Quality'
    const alert_type = isAqi
      ? a.level === 'Hazardous'
        ? 'AQI Hazardous'
        : 'Pollution Spike'
      : 'Heatwave'
    return {
      city_id: cityByName(a.province)?.city_id,
      city_name: a.province,
      alert_type,
      value: a.value,
      threshold_exceeded: isAqi ? 150 : 35,
      timestamp: a.timestamp,
    }
  })
}

// ── Stats: GET /stats → station rows → city-shaped rank rows ──
async function realStats() {
  const s = await real('/stats')
  const toRow = (r) => ({
    city_id: cityByName(r.province)?.city_id,
    city_name: r.province,
    temp: r.avg_temp,
    aqi: pm25ToAQI(r.avg_pm25),
  })
  return {
    top_hottest_cities: (s.top_hottest_stations ?? []).map(toRow),
    top_polluted_cities: (s.top_polluted_stations ?? []).map(toRow),
    national_avg_temp: s.national_avg_temp,
    national_avg_aqi: pm25ToAQI(s.national_avg_pm25),
  }
}

export function getRealtime(cityId) {
  return USE_MOCK ? delay(mockRealtime(cityId)) : realRealtime(cityId)
}

export function getHistory(cityId, startDate, endDate) {
  return USE_MOCK
    ? delay(mockHistory(cityId, startDate, endDate))
    : realHistory(cityId, startDate, endDate)
}

export function getCompare(cityId) {
  return USE_MOCK ? delay(mockCompare(cityId)) : realCompare(cityId)
}

export function getAlerts(cityId, severity) {
  return USE_MOCK ? delay(mockAlerts(cityId)) : realAlerts(cityId, severity)
}

// ── Realtime series: GET /realtime/series?station_id=&limit= → chart rows ──
async function realRealtimeSeries(cityId, limit) {
  const city = cityById(cityId)
  const arr = await real(`/realtime/series?station_id=${city.station_id}&limit=${limit}`)
  return arr.map((d) => ({
    time: d.timestamp,
    temp: d.temperature,
    humidity: d.humidity,
    pm2_5: d.pm25,
    aqi_value: d.aqi_index,
  }))
}

// Synthesizes a short series around the mock snapshot so USE_MOCK still works.
function mockRealtimeSeries(cityId, limit) {
  const now = Date.now()
  return Array.from({ length: limit }, (_, i) => {
    const rt = mockRealtime(cityId)
    const j = (Math.sin(i / 3) + 1) * 0.5 // smooth 0..1 wobble
    return {
      time: new Date(now - (limit - 1 - i) * 120000).toISOString(),
      temp: Math.round((rt.temp + (j - 0.5) * 3) * 10) / 10,
      humidity: Math.round(rt.humidity + (j - 0.5) * 8),
      pm2_5: Math.round((rt.pm2_5 + (j - 0.5) * 6) * 10) / 10,
      aqi_value: Math.round(rt.aqi_value + (j - 0.5) * 20),
    }
  })
}

export function getStats() {
  return USE_MOCK ? delay(mockStats()) : realStats()
}

export function getRealtimeSeries(cityId, limit = 30) {
  return USE_MOCK ? delay(mockRealtimeSeries(cityId, limit)) : realRealtimeSeries(cityId, limit)
}

// ── Day timeline: GET /hourly?station_id= → 24 hourly rows (0:00→23:00) ──
// Sourced from RealTimeReadings filtered to the latest day.
async function realDaySeries(cityId) {
  const city = cityById(cityId)
  const arr = await real(`/hourly?station_id=${city.station_id}`)
  return arr.map((d) => ({
    time: d.timestamp,
    hour: d.hour,
    temp: d.temperature,
    humidity: d.humidity,
    pm2_5: d.pm25,
    aqi_value: d.aqi_index,
  }))
}

export function getDaySeries(cityId) {
  return USE_MOCK ? delay(mockRealtimeSeries(cityId, 24)) : realDaySeries(cityId)
}
