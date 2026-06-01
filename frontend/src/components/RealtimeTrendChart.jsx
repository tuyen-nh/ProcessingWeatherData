import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { getDaySeries } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { CHART, axisProps, tooltipStyle, tooltipLabelStyle } from '../utils/chart.js'
import { Loader, ErrorBox, Empty } from './Loader.jsx'

// Selectable factors → field key on the series rows + color + unit.
const FACTORS = [
  { key: 'temp', labelKey: 'metric.temp', color: CHART.amber, unit: '°C' },
  { key: 'humidity', labelKey: 'metric.humidity', color: CHART.teal, unit: '%' },
  { key: 'pm2_5', labelKey: 'metric.pm25', color: '#a78bfa', unit: 'µg/m³' },
  { key: 'aqi_value', labelKey: 'metric.aqi', color: CHART.red, unit: 'AQI' },
]

// Day timeline is stamped on UTC hour boundaries (00:00→23:00) — format in UTC
// so ticks read the intended hour regardless of the browser's timezone.
const clock = (iso) =>
  new Date(iso).toLocaleTimeString('vi-VN', {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
  })

export default function RealtimeTrendChart({ cityId }) {
  const { t } = useTranslation()
  const [factorKey, setFactorKey] = useState('temp')
  const { data, loading, error } = useFetch(() => getDaySeries(cityId), [cityId])

  const factor = FACTORS.find((f) => f.key === factorKey)
  // Real observed data only, up to the current clock hour — never plot future hours.
  const nowHour = new Date().getHours()
  const series = (data || []).filter((d) => d.hour <= nowHour)

  return (
    <div className="panel p-6 fade-up" style={{ animationDelay: '360ms' }}>
      <div className="flex items-center justify-between mb-5 gap-4">
        <h3 className="label">{t('realtime.trendTitle')}</h3>
        <label className="flex items-center gap-2 label">
          {t('realtime.factor')}
          <select
            value={factorKey}
            onChange={(e) => setFactorKey(e.target.value)}
            className="bg-transparent border border-line hover:border-linehi focus:border-amber rounded-sm px-2 py-1 mono text-sm text-ink outline-none transition-colors"
          >
            {FACTORS.map((f) => (
              <option key={f.key} value={f.key} className="bg-bg-soft text-ink">
                {t(f.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <Loader label={t('realtime.loading')} />}
      {error && <ErrorBox error={error} />}
      {!loading && !error && series.length === 0 && <Empty />}

      {!loading && !error && series.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={series} margin={{ top: 5, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="time" tickFormatter={clock} interval={2} minTickGap={16} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              labelFormatter={clock}
              formatter={(v) => [`${v} ${factor.unit}`, t(factor.labelKey)]}
            />
            <Line
              type="monotone"
              dataKey={factor.key}
              name={t(factor.labelKey)}
              stroke={factor.color}
              dot={{ r: 1.5, fill: factor.color }}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
