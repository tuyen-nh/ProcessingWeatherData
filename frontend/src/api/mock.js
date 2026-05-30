// Deterministic mock generators matching the 5 documented endpoint schemas.
// Seeded by city_id so every view shows consistent numbers for a given city.
import { CITIES, cityById } from '../data/cities.js'
import { aqiCategory } from '../utils/aqi.js'

// simple seeded PRNG (mulberry32) — deterministic per seed
function rng(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

// base profile per city — warmer/more polluted in the South + big cities
function profile(city) {
  const r = rng(city.city_id * 7919)
  const south = city.region === 'South' ? 3 : city.region === 'Central' ? 1.5 : 0
  const bigCity = ['Ha Noi', 'Ho Chi Minh City', 'Da Nang', 'Hai Phong'].includes(city.city_name)
  return {
    baseTemp: round(26 + south + r() * 4),
    baseAqi: Math.round(60 + (bigCity ? 70 : 20) + r() * 40),
    baseHum: Math.round(60 + r() * 30),
  }
}

export function mockRealtime(cityId) {
  const city = cityById(cityId) || CITIES[0]
  const p = profile(city)
  const r = rng(city.city_id * 31 + 5)
  const aqi = Math.round(p.baseAqi + (r() - 0.5) * 40)
  return {
    city_id: city.city_id,
    city_name: city.city_name,
    temp: round(p.baseTemp + (r() - 0.5) * 4),
    humidity: Math.round(p.baseHum + (r() - 0.5) * 10),
    pm2_5: round(aqi * 0.7 + r() * 10),
    aqi_value: aqi,
    aqi_category: aqiCategory(aqi),
    is_anomaly: aqi > 160 || r() > 0.85,
    timestamp: new Date().toISOString(),
  }
}

export function mockHistory(cityId, startDate, endDate) {
  const city = cityById(cityId) || CITIES[0]
  const p = profile(city)
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 13 * 864e5)
  const end = endDate ? new Date(endDate) : new Date()
  const days = Math.max(1, Math.min(120, Math.round((end - start) / 864e5) + 1))
  const out = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 864e5)
    const r = rng(city.city_id * 1000 + i)
    const avg = round(p.baseTemp + (r() - 0.5) * 5)
    const aqi = Math.round(p.baseAqi + (r() - 0.5) * 50)
    out.push({
      city_id: city.city_id,
      date: d.toISOString().slice(0, 10),
      avg_temp: avg,
      max_temp: round(avg + 2 + r() * 4),
      min_temp: round(avg - 2 - r() * 4),
      avg_aqi: aqi,
      peak_aqi_hour: Math.floor(r() * 24),
    })
  }
  return out
}

export function mockCompare(cityId) {
  const rt = mockRealtime(cityId)
  const city = cityById(cityId) || CITIES[0]
  const p = profile(city)
  const histTemp = round(p.baseTemp + 0.5)
  const histAqi = p.baseAqi
  return {
    city_id: city.city_id,
    city_name: city.city_name,
    current_temp: rt.temp,
    historical_avg_temp: histTemp,
    current_aqi: rt.aqi_value,
    historical_avg_aqi: histAqi,
    temp_deviation: round(rt.temp - histTemp),
    aqi_deviation: rt.aqi_value - histAqi,
  }
}

const ALERT_TYPES = [
  { type: 'Pollution Spike', metric: 'PM2.5', threshold: 150 },
  { type: 'Heatwave', metric: 'Temperature', threshold: 38 },
  { type: 'AQI Hazardous', metric: 'AQI', threshold: 200 },
]

export function mockAlerts(cityId) {
  const pool = cityId ? [cityById(cityId)].filter(Boolean) : CITIES
  const out = []
  for (const city of pool) {
    const rt = mockRealtime(city.city_id)
    if (rt.is_anomaly || rt.aqi_value > 150) {
      const a = ALERT_TYPES[rt.aqi_value > 200 ? 2 : 0]
      out.push({
        city_id: city.city_id,
        city_name: city.city_name,
        alert_type: a.type,
        value: a.metric === 'AQI' ? rt.aqi_value : rt.pm2_5,
        threshold_exceeded: a.threshold,
        timestamp: rt.timestamp,
      })
    }
    if (rt.temp > 34) {
      out.push({
        city_id: city.city_id,
        city_name: city.city_name,
        alert_type: 'Heatwave',
        value: rt.temp,
        threshold_exceeded: 38,
        timestamp: rt.timestamp,
      })
    }
  }
  return out.sort((a, b) => b.value / b.threshold_exceeded - a.value / a.threshold_exceeded)
}

export function mockStats() {
  const rows = CITIES.map((c) => {
    const rt = mockRealtime(c.city_id)
    return { city_id: c.city_id, city_name: c.city_name, temp: rt.temp, aqi: rt.aqi_value }
  })
  const top_hottest_cities = [...rows].sort((a, b) => b.temp - a.temp).slice(0, 5)
  const top_polluted_cities = [...rows].sort((a, b) => b.aqi - a.aqi).slice(0, 5)
  return {
    top_hottest_cities,
    top_polluted_cities,
    national_avg_temp: round(rows.reduce((s, r) => s + r.temp, 0) / rows.length),
    national_avg_aqi: Math.round(rows.reduce((s, r) => s + r.aqi, 0) / rows.length),
  }
}
