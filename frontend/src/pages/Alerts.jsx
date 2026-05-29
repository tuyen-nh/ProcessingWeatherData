import { useState } from 'react'
import { getAlerts } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { fmt, fmtTime } from '../utils/aqi.js'
import { Loader, ErrorBox, Empty } from '../components/Loader.jsx'

const TYPE_STYLE = {
  'Pollution Spike': { icon: '🏭', color: '#f97316' },
  'AQI Hazardous': { icon: '☠️', color: '#ef4444' },
  Heatwave: { icon: '🔥', color: '#fb7185' },
}

export default function Alerts() {
  const [onlyAnomaly, setOnlyAnomaly] = useState(false)
  // Mock returns national alerts (no city filter) so the operator sees everything.
  const { data, loading, error } = useFetch(() => getAlerts(), [])

  if (loading) return <Loader label="Scanning for anomalies…" />
  if (error) return <ErrorBox error={error} />

  const rows = onlyAnomaly
    ? data.filter((a) => a.value / a.threshold_exceeded > 1)
    : data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {rows.length} active alert{rows.length !== 1 ? 's' : ''} nationwide · weather_realtime where is_anomaly
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={onlyAnomaly}
            onChange={(e) => setOnlyAnomaly(e.target.checked)}
            className="accent-cyan-500"
          />
          Only threshold-exceeding
        </label>
      </div>

      {rows.length === 0 && <Empty label="No active alerts. All clear." />}

      <div className="space-y-3">
        {rows.map((a, i) => {
          const style = TYPE_STYLE[a.alert_type] || { icon: '⚠️', color: '#94a3b8' }
          const ratio = a.value / a.threshold_exceeded
          return (
            <div
              key={`${a.city_id}-${a.alert_type}-${i}`}
              className="flex items-center gap-4 bg-slate-800/60 border-l-4 border border-slate-700 rounded-xl p-4"
              style={{ borderLeftColor: style.color }}
            >
              <span className="text-2xl">{style.icon}</span>
              <div className="flex-1">
                <div className="font-semibold text-white">
                  {a.alert_type}
                  <span className="text-slate-400 font-normal"> · {a.city_name}</span>
                </div>
                <div className="text-xs text-slate-400">{fmtTime(a.timestamp)}</div>
              </div>
              <div className="text-right">
                <div className="font-bold" style={{ color: style.color }}>
                  {fmt(a.value)}
                </div>
                <div className="text-[10px] text-slate-500">
                  threshold {a.threshold_exceeded} · {Math.round(ratio * 100)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
