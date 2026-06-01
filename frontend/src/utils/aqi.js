// US EPA AQI bands → category + color. Shared across all views.
export const AQI_BANDS = [
  { max: 50, category: 'Good', color: '#22c55e', text: '#052e16' },
  { max: 100, category: 'Moderate', color: '#eab308', text: '#1c1917' },
  { max: 150, category: 'Unhealthy (SG)', color: '#f97316', text: '#1c1917' },
  { max: 200, category: 'Unhealthy', color: '#ef4444', text: '#fff' },
  { max: 300, category: 'Very Unhealthy', color: '#a855f7', text: '#fff' },
  { max: Infinity, category: 'Hazardous', color: '#7f1d1d', text: '#fff' },
]

export function aqiBand(value) {
  return AQI_BANDS.find((b) => value <= b.max) || AQI_BANDS[AQI_BANDS.length - 1]
}

export const aqiColor = (value) => aqiBand(value).color
export const aqiCategory = (value) => aqiBand(value).category

// PM2.5 (µg/m³) → US EPA AQI. Ported from StreamingAQI.java calculateAQI UDF so
// batch views (which store only avg_pm25) yield the same AQI the speed layer does.
export function pm25ToAQI(pm25) {
  if (pm25 === null || pm25 === undefined || Number.isNaN(pm25)) return null
  const c = Number(pm25)
  const lerp = (cLo, cHi, iLo, iHi) => Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo)
  if (c <= 12.0) return Math.round((50.0 / 12.0) * c)
  if (c <= 35.4) return lerp(12.1, 35.4, 51, 100)
  if (c <= 55.4) return lerp(35.5, 55.4, 101, 150)
  if (c <= 150.4) return lerp(55.5, 150.4, 151, 200)
  if (c <= 250.4) return lerp(150.5, 250.4, 201, 300)
  if (c <= 350.4) return lerp(250.5, 350.4, 301, 400)
  if (c <= 500.4) return lerp(350.5, 500.4, 401, 500)
  return 500
}

export function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return Number(n).toFixed(digits)
}

export function fmtTime(iso) {
  if (!iso) return '–'
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', { hour12: false })
}
