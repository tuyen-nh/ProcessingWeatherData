import { useState } from 'react'
import { getAlerts } from '../api/client.js'
import { useFetch } from '../hooks/useFetch.js'
import { fmt, fmtTime } from '../utils/aqi.js'
import { Loader, ErrorBox, Empty } from '../components/Loader.jsx'

const TYPE_STYLE = {
  'Pollution Spike': { glyph: '◆', color: '#f97316' },
  'AQI Hazardous': { glyph: '☣', color: '#e0644b' },
  Heatwave: { glyph: '▲', color: '#e8a04b' },
}

export default function Alerts() {
  const [onlyAnomaly, setOnlyAnomaly] = useState(false)
  const { data, loading, error } = useFetch(() => getAlerts(), [])

  if (loading) return <Loader label="Scanning for anomalies…" />
  if (error) return <ErrorBox error={error} />

  const rows = onlyAnomaly ? data.filter((a) => a.value / a.threshold_exceeded > 1) : data

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between fade-up">
        <p className="label">
          {rows.length} active alert{rows.length !== 1 ? 's' : ''} · nationwide
        </p>
        <label className="flex items-center gap-2 label cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyAnomaly}
            onChange={(e) => setOnlyAnomaly(e.target.checked)}
            className="accent-amber"
          />
          threshold-exceeding only
        </label>
      </div>

      {rows.length === 0 && <Empty label="All clear · no active alerts" />}

      <div className="space-y-3">
        {rows.map((a, i) => {
          const style = TYPE_STYLE[a.alert_type] || { glyph: '●', color: '#a8a094' }
          const ratio = a.value / a.threshold_exceeded
          return (
            <div
              key={`${a.city_id}-${a.alert_type}-${i}`}
              className="panel border-l-[3px] flex items-center gap-5 p-5 fade-up"
              style={{ borderLeftColor: style.color, animationDelay: `${Math.min(i * 50, 400)}ms` }}
            >
              <span className="mono text-xl" style={{ color: style.color }}>{style.glyph}</span>
              <div className="flex-1 min-w-0">
                <div className="display text-lg text-ink tracking-tight">
                  {a.alert_type}
                  <span className="text-faint font-sans text-sm font-normal"> · {a.city_name}</span>
                </div>
                <div className="label mt-0.5">{fmtTime(a.timestamp)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="mono text-2xl font-medium" style={{ color: style.color }}>{fmt(a.value)}</div>
                <div className="label mt-0.5">
                  thr {a.threshold_exceeded} · {Math.round(ratio * 100)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
