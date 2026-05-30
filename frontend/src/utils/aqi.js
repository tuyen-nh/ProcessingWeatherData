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

export function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return Number(n).toFixed(digits)
}

export function fmtTime(iso) {
  if (!iso) return '–'
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', { hour12: false })
}
